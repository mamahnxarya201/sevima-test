export type ExecutionLogStepSnapshot = {
  stepId: string;
  status: string;
  logs?: string | null;
  errorMessage?: string | null;
  outputs?: unknown;
  startedAt?: string | null;
  endedAt?: string | null;
};

export type ExecutionLogRun = {
  id: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  duration: number | null;
  triggeredByLabel: string;
  workflowVersion: {
    workflowId: string;
    versionNumber: number;
    workflow: { name: string };
    nodeTypesById: Record<string, string>;
    nodeDescriptionsById: Record<string, string>;
  };
  stepRuns: ExecutionLogStepSnapshot[];
};

export type ExecutionLogsListResponse = {
  runs: ExecutionLogRun[];
  total: number;
  limit: number;
  offset: number;
};

export async function fetchExecutionLogs(
  token: string,
  params?: { limit?: number; offset?: number; search?: string; sort?: 'newest' | 'oldest' }
): Promise<ExecutionLogsListResponse | null> {
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set('limit', String(params.limit));
  if (params?.offset != null) sp.set('offset', String(params.offset));
  if (params?.search && params.search.trim()) sp.set('search', params.search.trim());
  if (params?.sort) sp.set('sort', params.sort);
  const q = sp.toString();
  const res = await fetch(`/api/runs${q ? `?${q}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as ExecutionLogsListResponse;
}
