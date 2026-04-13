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

export const isSidebarOpenAtom = atom(true);

export const workflowTitleAtom = atomWithStorage<string>("workflowTitle", "Building Silver Jet Rocket");
export const workflowLastUpdatedAtom = atom("2 mins ago");

export const tenantNameAtom = atom("Loading...");

export const workflowHistoryAtom = atom([
  { id: 1, user: "Engineering Team", action: "Updated TriggerNode webhook URL", timestamp: "2 mins ago" },
  { id: 2, user: "System", action: "Workflow automatically saved", timestamp: "1 hour ago" },
  { id: 3, user: "Alice Johnson", action: "Removed legacy SMS Notification action", timestamp: "4 hours ago" },
  { id: 4, user: "Engineering Team", action: "Created workflow", timestamp: "2 days ago" }
]);

export const selectedNodeIdAtom = atom<string | null>(null);

export const nodesAtom = atomWithStorage<Node[]>('workflow-nodes', []);
export const edgesAtom = atomWithStorage<Edge[]>('workflow-edges', []);

/** Manual Save button: in-flight and last error (not persisted). */
export const workflowSavingAtom = atom(false);
export const workflowSaveErrorAtom = atom<string | null>(null);
