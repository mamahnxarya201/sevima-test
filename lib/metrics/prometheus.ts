/**
 * lib/metrics/prometheus.ts
 *
 * Singleton Prometheus registry + all application metrics.
 * Imported by executionEngine, schedulerPoller, and the /api/metrics route.
 */

import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();

collectDefaultMetrics({ register: registry, prefix: 'flowforge_' });

// ── Workflow runs ──────────────────────────────────────────────────────────

export const workflowRunsTotal = new Counter({
  name: 'flowforge_workflow_runs_total',
  help: 'Total workflow runs by final status',
  labelNames: ['status', 'tenant_id'] as const,
  registers: [registry],
});

export const workflowRunsActive = new Gauge({
  name: 'flowforge_workflow_runs_active',
  help: 'Currently running workflows',
  labelNames: ['tenant_id'] as const,
  registers: [registry],
});

export const workflowRunDuration = new Histogram({
  name: 'flowforge_workflow_run_duration_seconds',
  help: 'Workflow run duration in seconds',
  labelNames: ['status', 'tenant_id'] as const,
  buckets: [0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600],
  registers: [registry],
});

// ── Step runs ──────────────────────────────────────────────────────────────

export const stepRunsTotal = new Counter({
  name: 'flowforge_step_runs_total',
  help: 'Total step runs by status and node type',
  labelNames: ['status', 'node_type', 'tenant_id'] as const,
  registers: [registry],
});

export const stepRunDuration = new Histogram({
  name: 'flowforge_step_run_duration_seconds',
  help: 'Step run duration in seconds',
  labelNames: ['node_type', 'tenant_id'] as const,
  buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [registry],
});

export const stepRetries = new Counter({
  name: 'flowforge_step_retries_total',
  help: 'Total step retry attempts',
  labelNames: ['node_type', 'tenant_id'] as const,
  registers: [registry],
});

// ── Scheduler / pg_cron ────────────────────────────────────────────────────

export const schedulerPollsClaimed = new Counter({
  name: 'flowforge_scheduler_runs_claimed_total',
  help: 'Total pending scheduled runs claimed by the poller',
  labelNames: ['tenant_id'] as const,
  registers: [registry],
});

export const schedulerPollErrors = new Counter({
  name: 'flowforge_scheduler_poll_errors_total',
  help: 'Total scheduler poll errors',
  registers: [registry],
});

export const schedulerPendingQueueDepth = new Gauge({
  name: 'flowforge_scheduler_pending_queue_depth',
  help: 'Unclaimed rows in the pending_scheduled_runs table',
  registers: [registry],
});
