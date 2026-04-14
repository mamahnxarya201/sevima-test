import { z } from 'zod';

export interface WorkflowSettings {
  /** Default retry count applied to nodes without explicit retries (0-10). */
  defaultNodeRetries: number;
  /** Base delay in ms for exponential backoff: delay = base * 2^attempt. */
  defaultRetryDelayMs: number;
  /** How many node failures the workflow tolerates before stopping. */
  maxNodeFailures: number;
  /** How many times to restart the entire workflow (each creates a new WorkflowRun). */
  workflowRetries: number;
  /** Max wall-clock time in ms for a single workflow run. */
  globalTimeoutMs: number;
}

export const DEFAULT_WORKFLOW_SETTINGS: WorkflowSettings = {
  defaultNodeRetries: 0,
  defaultRetryDelayMs: 1000,
  maxNodeFailures: 1,
  workflowRetries: 0,
  globalTimeoutMs: 300_000, // 5 minutes
};

export const workflowSettingsSchema = z.object({
  defaultNodeRetries: z.number().int().min(0).max(10),
  defaultRetryDelayMs: z.number().int().min(0).max(60_000),
  maxNodeFailures: z.number().int().min(1).max(100),
  workflowRetries: z.number().int().min(0).max(10),
  globalTimeoutMs: z.number().int().min(5_000).max(3_600_000), // 5s – 1h
});

/** Parse raw JSON from DB into validated settings, falling back to defaults. */
export function parseWorkflowSettings(raw: unknown): WorkflowSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_WORKFLOW_SETTINGS };
  const merged = { ...DEFAULT_WORKFLOW_SETTINGS, ...(raw as Record<string, unknown>) };
  const result = workflowSettingsSchema.safeParse(merged);
  return result.success ? result.data : { ...DEFAULT_WORKFLOW_SETTINGS };
}
