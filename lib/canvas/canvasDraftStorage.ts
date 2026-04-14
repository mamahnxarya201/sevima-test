import type { Node, Edge } from '@xyflow/react';

/** v1: nodes, edges, viewport. v2: + workflowTitle (per-workflow; replaces global `workflowTitle` LS key). */
export const CANVAS_DRAFT_VERSION = 2 as const;

export type CanvasViewport = { x: number; y: number; zoom: number };

/** Persisted slice: scoped by tenant + workflow in the storage key (also embedded for validation). */
export type CanvasDraftPayload = {
  v: 1 | typeof CANVAS_DRAFT_VERSION;
  tenantId: string;
  workflowId: string;
  nodes: Node[];
  edges: Edge[];
  viewport: CanvasViewport;
  /** v2+: mirrors `workflowTitleAtom` for this workflow */
  workflowTitle?: string;
  savedAt: number;
};

const KEY_PREFIX = 'sevima.canvas.v1';

/** Stable localStorage key — never mix tenants or workflows. */
export function canvasDraftStorageKey(tenantId: string, workflowId: string): string {
  return `${KEY_PREFIX}.${tenantId}.${workflowId}`;
}

export function parseCanvasDraft(raw: string | null): CanvasDraftPayload | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as CanvasDraftPayload;
    if ((o.v !== 1 && o.v !== CANVAS_DRAFT_VERSION) || !o.tenantId || !o.workflowId) return null;
    if (!Array.isArray(o.nodes) || !Array.isArray(o.edges)) return null;
    if (!o.viewport || typeof o.viewport.x !== 'number' || typeof o.viewport.zoom !== 'number') return null;
    if (o.workflowTitle !== undefined && typeof o.workflowTitle !== 'string') return null;
    return o;
  } catch {
    return null;
  }
}

export function loadCanvasDraft(tenantId: string, workflowId: string): CanvasDraftPayload | null {
  if (typeof window === 'undefined') return null;
  const key = canvasDraftStorageKey(tenantId, workflowId);
  return parseCanvasDraft(localStorage.getItem(key));
}

export function saveCanvasDraft(
  payload: Omit<CanvasDraftPayload, 'v' | 'savedAt'> & { savedAt?: number; workflowTitle: string }
): void {
  if (typeof window === 'undefined') return;
  const full: CanvasDraftPayload = {
    v: CANVAS_DRAFT_VERSION,
    tenantId: payload.tenantId,
    workflowId: payload.workflowId,
    nodes: payload.nodes,
    edges: payload.edges,
    viewport: payload.viewport,
    workflowTitle: payload.workflowTitle,
    savedAt: payload.savedAt ?? Date.now(),
  };
  const key = canvasDraftStorageKey(payload.tenantId, payload.workflowId);
  try {
    localStorage.setItem(key, JSON.stringify(full));
  } catch (e) {
    console.warn('[canvasDraft] localStorage set failed', e);
  }
}

/** Legacy global keys from before scoped storage — safe to remove once migrated. */
const LEGACY_NODE_KEY = 'workflow-nodes';
const LEGACY_EDGE_KEY = 'workflow-edges';
/** Replaced by per-workflow `workflowTitle` inside scoped canvas draft (v2). */
const LEGACY_GLOBAL_TITLE_KEY = 'workflowTitle';

export function removeLegacyCanvasStorageKeys(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(LEGACY_NODE_KEY);
    localStorage.removeItem(LEGACY_EDGE_KEY);
    localStorage.removeItem(LEGACY_GLOBAL_TITLE_KEY);
  } catch {
    /* ignore */
  }
}
