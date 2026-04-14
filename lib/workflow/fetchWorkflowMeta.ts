export type WorkflowCreator = { name: string; email: string };

export type WorkflowVersionSummary = { id: string; versionNumber: number };

export type WorkflowMeta = {
  workflow: {
    id: string;
    name: string;
    ownerId: string;
    activeVersion: number;
    updatedAt: string;
    createdAt: string;
    versions: Array<{
      id: string;
      versionNumber: number;
      definition?: unknown;
      editorState?: unknown;
    }>;
  };
  createdBy: WorkflowCreator | null;
};

/**
 * GET /api/workflows/:id — parses extended payload (creator + version list).
 */
export async function fetchWorkflowMeta(workflowId: string, token: string): Promise<WorkflowMeta | null> {
  const res = await fetch(`/api/workflows/${workflowId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    workflow?: WorkflowMeta['workflow'];
    createdBy?: WorkflowCreator | null;
  };
  if (!data.workflow) return null;
  return {
    workflow: data.workflow,
    createdBy: data.createdBy ?? null,
  };
}

export function versionSummariesFromWorkflow(w: WorkflowMeta['workflow']): WorkflowVersionSummary[] {
  return (w.versions ?? [])
    .map((v) => ({ id: v.id, versionNumber: v.versionNumber }))
    .sort((a, b) => b.versionNumber - a.versionNumber);
}

/**
 * GET /api/workflows/:id?atVersion=n — single checkpoint payload (definition + editorState).
 */
export async function fetchWorkflowAtVersion(
  workflowId: string,
  versionNumber: number,
  token: string
): Promise<WorkflowMeta | null> {
  const res = await fetch(`/api/workflows/${workflowId}?atVersion=${versionNumber}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    workflow?: WorkflowMeta['workflow'];
    createdBy?: WorkflowCreator | null;
  };
  if (!data.workflow) return null;
  return {
    workflow: data.workflow,
    createdBy: data.createdBy ?? null,
  };
}
