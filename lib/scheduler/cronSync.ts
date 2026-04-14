/**
 * lib/scheduler/cronSync.ts
 *
 * Manages pg_cron jobs on the management database. Each enabled WorkflowSchedule
 * row gets a corresponding pg_cron job that inserts into a `pending_scheduled_runs`
 * table. The app polls that table to trigger actual workflow runs.
 *
 * pg_cron must be installed on the management PostgreSQL instance:
 *   CREATE EXTENSION IF NOT EXISTS pg_cron;
 *
 * The pending table lives in the management DB (created by ensurePendingTable).
 */

import { managementDb } from '@/lib/prisma/management';

const PENDING_TABLE = 'pending_scheduled_runs';

/**
 * Ensures the staging table exists for pg_cron to write into.
 * Idempotent — safe to call on every app start.
 */
export async function ensurePendingTable(): Promise<void> {
  await managementDb.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "${PENDING_TABLE}" (
      id SERIAL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      workflow_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

/**
 * Sync a single schedule to pg_cron. Creates or replaces the cron job.
 * Returns the pg_cron job ID.
 */
export async function upsertCronJob(
  scheduleId: string,
  tenantId: string,
  workflowId: string,
  cronExpr: string,
): Promise<number> {
  const jobName = `wf_${scheduleId}`;
  const innerSql = `INSERT INTO "${PENDING_TABLE}" (tenant_id, workflow_id) VALUES ('${tenantId}', '${workflowId}')`;

  // Unschedule any existing job with this name (ignore if doesn't exist)
  try {
    await managementDb.$executeRawUnsafe(
      `SELECT cron.unschedule('${jobName}');`
    );
  } catch {
    // Job didn't exist — fine
  }

  // Use $cmd$ dollar-quoting for the inner SQL to avoid quoting collisions
  const scheduleQuery = `SELECT cron.schedule('${jobName}', '${cronExpr}', $cmd$${innerSql}$cmd$) AS schedule;`;

  const result = await managementDb.$queryRawUnsafe<[{ schedule: number }]>(scheduleQuery);

  const jobId = result[0]?.schedule;
  if (typeof jobId !== 'number') {
    throw new Error(`pg_cron schedule did not return a job ID. Query: ${scheduleQuery}`);
  }

  await managementDb.workflowSchedule.update({
    where: { id: scheduleId },
    data: { pgCronJobId: jobId },
  });

  return jobId;
}

/**
 * Remove a pg_cron job for a schedule.
 */
export async function removeCronJob(scheduleId: string): Promise<void> {
  const jobName = `wf_${scheduleId}`;
  try {
    await managementDb.$executeRawUnsafe(
      `SELECT cron.unschedule('${jobName}');`
    );
  } catch {
    // Already gone
  }
}

export interface PendingScheduledRun {
  id: number;
  tenant_id: string;
  workflow_id: string;
  created_at: Date;
}

/**
 * Fetch and delete pending scheduled runs in one atomic operation.
 * Returns the runs that were claimed.
 */
export async function claimPendingRuns(batchSize = 50): Promise<PendingScheduledRun[]> {
  const rows = await managementDb.$queryRawUnsafe<PendingScheduledRun[]>(`
    DELETE FROM "${PENDING_TABLE}"
    WHERE id IN (
      SELECT id FROM "${PENDING_TABLE}"
      ORDER BY created_at ASC
      LIMIT ${batchSize}
    )
    RETURNING id, tenant_id, workflow_id, created_at;
  `);
  return rows;
}
