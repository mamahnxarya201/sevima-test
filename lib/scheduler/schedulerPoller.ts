/**
 * lib/scheduler/schedulerPoller.ts
 *
 * In-process poller that claims pending scheduled runs from the management DB
 * and triggers workflow execution. Runs on a configurable interval (default 10s).
 *
 * Start with `startSchedulerPoller()` — call once on app init. Idempotent.
 */

import { managementDb } from '@/lib/prisma/management';
import { getTenantDb } from '@/lib/prisma/tenant';
import { runWorkflowWithRetries } from '@/lib/orchestrator/executionEngine';
import { claimPendingRuns, ensurePendingTable } from './cronSync';
import {
  schedulerPollsClaimed,
  schedulerPollErrors,
  schedulerPendingQueueDepth,
} from '@/lib/metrics/prometheus';
import type { DagSchema } from '@/lib/dag/types';

const POLL_INTERVAL_MS = parseInt(process.env.SCHEDULER_POLL_INTERVAL_MS ?? '10000', 10);

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;

async function processPending(): Promise<void> {
  try {
    const runs = await claimPendingRuns();
    if (runs.length === 0) return;

    for (const pending of runs) {
      try {
        const tenant = await managementDb.tenant.findUnique({
          where: { id: pending.tenant_id },
          select: { connectionUrl: true },
        });
        if (!tenant) {
          console.warn(`[scheduler] Tenant ${pending.tenant_id} not found, skipping`);
          continue;
        }

        const tenantDb = getTenantDb(tenant.connectionUrl);

        const workflow = await tenantDb.workflow.findUnique({
          where: { id: pending.workflow_id },
          include: {
            versions: {
              where: { versionNumber: { gt: 0 } },
              orderBy: { versionNumber: 'desc' },
              take: 1,
            },
          },
        });

        if (!workflow || !workflow.versions[0]) {
          console.warn(`[scheduler] Workflow ${pending.workflow_id} has no published version, skipping`);
          continue;
        }

        const version = workflow.versions[0];
        const definition = version.definition as unknown as DagSchema;

        const run = await tenantDb.workflowRun.create({
          data: {
            workflowVersionId: version.id,
            triggeredById: null,
            status: 'PENDING',
          },
        });

        console.log(`[scheduler] Triggering scheduled run ${run.id} for workflow ${pending.workflow_id}`);

        schedulerPollsClaimed.inc({ tenant_id: pending.tenant_id });

        void runWorkflowWithRetries(
          run.id,
          version.id,
          definition,
          tenantDb,
          pending.tenant_id,
          workflow.settings,
        ).catch((err) => {
          console.error(`[scheduler] Run ${run.id} failed:`, err);
        });
      } catch (err) {
        console.error(`[scheduler] Error processing pending run for workflow ${pending.workflow_id}:`, err);
      }
    }
  } catch (err) {
    schedulerPollErrors.inc();
    console.error('[scheduler] Poll error:', err);
  }

  try {
    const [{ count }] = await managementDb.$queryRawUnsafe<[{ count: bigint }]>(
      `SELECT COUNT(*) AS count FROM pending_scheduled_runs`
    );
    schedulerPendingQueueDepth.set(Number(count));
  } catch {
    // Table may not exist yet
  }
}

export async function startSchedulerPoller(): Promise<void> {
  if (started) return;
  started = true;

  try {
    await ensurePendingTable();
  } catch (err) {
    console.warn('[scheduler] Could not ensure pending table (pg_cron may not be installed):', err);
    started = false;
    return;
  }

  console.log(`[scheduler] Poller started (interval ${POLL_INTERVAL_MS}ms)`);
  timer = setInterval(() => void processPending(), POLL_INTERVAL_MS);
}

export function stopSchedulerPoller(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  started = false;
}
