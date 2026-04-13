import type { DagSchema } from '@/lib/dag/types';

export type SaveWorkflowResult =
  | { ok: true; workflowId: string }
  | { ok: false; status: number; message: string };

export type SaveWorkflowParams = {
  name: string;
  definition: DagSchema;
  /** Current id from persisted storage, or null to create */
  workflowId: string | null;
  token: string;
};

/**
 * Persists workflow definition via REST (POST create or PATCH update).
 * Auth: Bearer token from Better Auth JWT.
 */
export async function saveWorkflowToApi(params: SaveWorkflowParams): Promise<SaveWorkflowResult> {
  const { name, definition, workflowId, token } = params;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  const body = JSON.stringify({ name, definition });

  if (workflowId) {
    const response = await fetch(`/api/workflows/${workflowId}`, {
      method: 'PATCH',
      headers,
      body,
    });
    if (!response.ok) {
      const message = (await response.text()) || 'Save failed';
      return { ok: false, status: response.status, message };
    }
    return { ok: true, workflowId };
  }

  const response = await fetch('/api/workflows', {
    method: 'POST',
    headers,
    body,
  });

  let data: { workflow?: { id?: string }; error?: string } = {};
  try {
    data = await response.json();
  } catch {
    /* empty */
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: data.error ?? 'Save failed',
    };
  }

  const newId = data.workflow?.id;
  if (!newId) {
    return { ok: false, status: response.status, message: 'No workflow id returned' };
  }

  return { ok: true, workflowId: newId };
}
