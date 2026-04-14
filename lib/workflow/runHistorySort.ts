/** Parse Prisma DateTime from API JSON (string) or in-process Date. */
function runTimeMs(value: unknown): number {
  if (value == null) return 0;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? 0 : t;
  }
  if (typeof value === 'string') {
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? 0 : t;
  }
  return 0;
}

/**
 * Best-effort “when did this run matter” timestamp for ordering.
 * Uses max(endedAt, startedAt) so completed runs sort by finish time; in-flight by start.
 */
export function workflowRunRecencyMs(run: { startedAt: unknown; endedAt: unknown }): number {
  return Math.max(runTimeMs(run.endedAt), runTimeMs(run.startedAt));
}

/** Latest / most recent first, oldest last. Stable tie-break on run id. */
export function sortWorkflowRunsLatestFirst<
  T extends { id: string; startedAt: unknown; endedAt: unknown },
>(runs: T[]): T[] {
  return [...runs].sort((a, b) => {
    const diff = workflowRunRecencyMs(b) - workflowRunRecencyMs(a);
    if (diff !== 0) return diff;
    return b.id.localeCompare(a.id);
  });
}
