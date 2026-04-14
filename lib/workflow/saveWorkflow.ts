import type { DagSchema } from '@/lib/dag/types';
import type { WorkflowEditorState } from '@/lib/canvas/editorState';

export type SaveWorkflowResult =
  | { ok: true; workflowId: string; activeVersion?: number; updatedAt?: string }
  | { ok: false; status: number; message: string };

export type SaveWorkflowParams = {
  name: string;
  description?: string | null;
  definition: DagSchema;
  /** Serialized React Flow state for layout restore */
  editorState: WorkflowEditorState;
  /** Current id from persisted storage, or null to create */
  workflowId: string | null;
  token: string;
  /**
   * false/omit = draft (update latest WorkflowVersion in place).
   * true = new immutable version row (checkpoint).
   */
  checkpoint?: boolean;
};

/**
 * Persists workflow definition via REST (POST create or PATCH update).
 * Auth: Bearer token from Better Auth JWT.
 */
function parseWorkflowResponse(data: unknown): { activeVersion?: number; updatedAt?: string } {
  if (!data || typeof data !== 'object') return {};
  const w = (data as { workflow?: { activeVersion?: unknown; updatedAt?: unknown } }).workflow;
  const out: { activeVersion?: number; updatedAt?: string } = {};
  const av = w?.activeVersion;
  if (typeof av === 'number' && Number.isFinite(av)) out.activeVersion = av;
  const u = w?.updatedAt;
  if (typeof u === 'string') out.updatedAt = u;
  else if (u instanceof Date) out.updatedAt = u.toISOString();
  return out;
}

export async function saveWorkflowToApi(params: SaveWorkflowParams): Promise<SaveWorkflowResult> {
  const { name, description, definition, editorState, workflowId, token, checkpoint } = params;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  if (workflowId) {
    const body = JSON.stringify({
      name,
      description,
      definition,
      editorState,
      ...(checkpoint === true ? { checkpoint: true } : {}),
    });
    const response = await fetch(`/api/workflows/${workflowId}`, {
      method: 'PATCH',
      headers,
      body,
    });
    if (!response.ok) {
      const raw = await response.text();
      let message = 'Save failed';
      try {
        const errBody = JSON.parse(raw) as { error?: string };
        if (typeof errBody.error === 'string') message = errBody.error;
      } catch {
        if (raw) message = raw;
      }
      if (response.status === 403) {
        message = 'You do not have permission to save this workflow.';
      }
      return { ok: false, status: response.status, message };
    }
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      json = undefined;
    }
    const parsed = parseWorkflowResponse(json);
    return {
      ok: true,
      workflowId,
      ...(parsed.activeVersion !== undefined ? { activeVersion: parsed.activeVersion } : {}),
      ...(parsed.updatedAt !== undefined ? { updatedAt: parsed.updatedAt } : {}),
    };
  }

  const response = await fetch('/api/workflows', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name,
      description: description ?? undefined,
      definition,
      editorState,
    }),
  });

  let data: { workflow?: { id?: string; activeVersion?: number; updatedAt?: unknown }; error?: string } = {};
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

  const parsed = parseWorkflowResponse({ workflow: data.workflow });
  return {
    ok: true,
    workflowId: newId,
    ...(parsed.activeVersion !== undefined ? { activeVersion: parsed.activeVersion } : {}),
    ...(parsed.updatedAt !== undefined ? { updatedAt: parsed.updatedAt } : {}),
  };
}
