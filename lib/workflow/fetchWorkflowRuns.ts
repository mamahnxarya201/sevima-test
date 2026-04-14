export type WorkflowRunStepSnapshot = {
  stepId: string;
  status: string;
  logs?: string | null;
  errorMessage?: string | null;
  outputs?: unknown;
  startedAt?: string | null;
  endedAt?: string | null;
};

export type WorkflowRunListItem = {
  id: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  duration: number | null;
  workflowVersion: { versionNumber: number };
  stepRuns: WorkflowRunStepSnapshot[];
};

export type WorkflowRunsListResponse = {
  runs: WorkflowRunListItem[];
  total: number;
  limit: number;
  offset: number;
};

export async function fetchWorkflowRuns(
  workflowId: string,
  token: string,
  params?: { limit?: number; offset?: number }
): Promise<WorkflowRunsListResponse | null> {
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set('limit', String(params.limit));
  if (params?.offset != null) sp.set('offset', String(params.offset));
  const q = sp.toString();
  const res = await fetch(`/api/workflows/${workflowId}/runs${q ? `?${q}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as WorkflowRunsListResponse;
}
