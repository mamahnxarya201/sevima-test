import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import type { Node, Edge } from '@xyflow/react';

/** Plain string in localStorage key `workflow_id` (legacy + current). */
const workflowIdStorage = {
  getItem: (key: string, initial: string | null): string | null => {
    if (typeof window === 'undefined') return initial;
    const raw = localStorage.getItem(key);
    if (raw === null || raw === '') return null;
    return raw;
  },
  setItem: (key: string, value: string | null) => {
    if (typeof window === 'undefined') return;
    if (value === null || value === '') localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    localStorage.removeItem(key);
  },
};

export const persistedWorkflowIdAtom = atomWithStorage<string | null>(
  'workflow_id',
  null,
  workflowIdStorage
);

/** In-memory only; persisted per workflow in scoped canvas draft (`useCanvasDraftPersistence`). */
export const workflowTitleAtom = atom<string>('');
export const workflowLastUpdatedAtom = atom('—');

/** Latest workflow.activeVersion from API (draft + checkpoint share this number until a new checkpoint bumps it). */
export const workflowActiveVersionAtom = atom<number | null>(null);

/** Snapshot version currently shown on canvas; `null` means following the latest draft (same as head). */
export const workflowViewingVersionAtom = atom<number | null>(null);

/** When set, canvas loads that version from GET ?atVersion= and clears this atom. */
export const workflowPendingVersionLoadAtom = atom<number | null>(null);

/** Management DB user who owns the workflow (`Workflow.ownerId`). */
export const workflowCreatorAtom = atom<{ name: string; email: string } | null>(null);

/** Checkpoint rows, newest version number first (from GET /api/workflows/:id). */
export const workflowVersionsListAtom = atom<Array<{ id: string; versionNumber: number }>>([]);

export const tenantNameAtom = atom('Loading...');

/** Resolved from GET /api/tenants — used to scope canvas localStorage drafts per tenant. */
export const tenantIdAtom = atom<string | null>(null);

/** Mirrors React Flow viewport for Jotai subscribers (persisted via canvas draft hook). */
export const canvasViewportAtom = atom({ x: 0, y: 0, zoom: 1 });

/** Debug / derived: `tenantId:workflowId` when both set — canvas draft storage scope. */
export const canvasDraftScopeAtom = atom((get) => {
  const t = get(tenantIdAtom);
  const w = get(persistedWorkflowIdAtom);
  if (!t || !w) return null;
  return `${t}:${w}` as const;
});

export const selectedNodeIdAtom = atom<string | null>(null);

/** In-memory only — persisted via scoped `sevima.canvas.v1.<tenantId>.<workflowId>` (see useCanvasDraftPersistence). */
export const nodesAtom = atom<Node[]>([]);
export const edgesAtom = atom<Edge[]>([]);

/** Draft autosave in-flight */
export const workflowSavingAtom = atom(false);
export const workflowSaveErrorAtom = atom<string | null>(null);

/** Explicit checkpoint (new version row) in-flight */
export const workflowCheckpointingAtom = atom(false);
