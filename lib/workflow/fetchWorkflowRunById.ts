/**
 * GET /api/runs/:runId — used to hydrate failure details when WebSocket
 * events are missed or for inspection in DevTools Network tab.
 */
export type WorkflowRunDetailResponse = {
  run: {
    id: string;
    status: string;
    errorMessage?: string | null;
    stepRuns?: unknown[];
    [key: string]: unknown;
  };
};

export async function fetchWorkflowRunById(
  runId: string,
  token: string
): Promise<WorkflowRunDetailResponse | null> {
  const res = await fetch(`/api/runs/${encodeURIComponent(runId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as WorkflowRunDetailResponse;
}
