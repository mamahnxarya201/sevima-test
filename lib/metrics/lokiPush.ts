/**
 * lib/metrics/lokiPush.ts
 *
 * Fire-and-forget push of step logs to Loki via the HTTP push API.
 * Logs are labeled by runId, stepId, nodeType, and status for LogQL filtering.
 */

const LOKI_URL = process.env.LOKI_PUSH_URL ?? 'http://localhost:3100/loki/api/v1/push';

export function pushStepLog(
  runId: string,
  stepId: string,
  nodeType: string,
  status: string,
  logs?: string | null,
  error?: string | null,
  tenantId?: string,
): void {
  const line = error ? `[${status}] ${error}\n${logs ?? ''}` : logs ?? '';
  if (!line.trim()) return;

  const stream: Record<string, string> = {
    job: 'flowforge',
    run_id: runId,
    step_id: stepId,
    node_type: nodeType,
    level: status === 'SUCCESS' ? 'info' : 'error',
  };
  if (tenantId) stream.tenant_id = tenantId;

  const payload = {
    streams: [
      {
        stream,
        values: [[String(Date.now() * 1_000_000), line]],
      },
    ],
  };

  fetch(LOKI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch((err) => {
    console.warn('[loki] push failed:', err instanceof Error ? err.message : err);
  });
}
