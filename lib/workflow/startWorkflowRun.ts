export type StartWorkflowRunResult = { runId: string };

export async function startWorkflowRun(params: {
  workflowId: string;
  token: string;
}): Promise<StartWorkflowRunResult> {
  const { workflowId, token } = params;
  const res = await fetch(`/api/workflows/${workflowId}/run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  const body = (await res.json().catch(() => ({}))) as {
    runId?: string;
    error?: string;
  };

  if (!res.ok || !body.runId) {
    if (res.status === 403) {
      throw new Error('You do not have permission to run workflows.');
    }
    throw new Error(body.error ?? 'Run failed');
  }

  return { runId: body.runId };
}
