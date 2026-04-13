import { atom } from 'jotai';

export const isSidebarOpenAtom = atom(true);

export const workflowTitleAtom = atom("Building Silver Jet Rocket");
export const workflowLastUpdatedAtom = atom("2 mins ago");

export const tenantNameAtom = atom("Loading...");

export const workflowHistoryAtom = atom([
  { id: 1, user: "Engineering Team", action: "Updated TriggerNode webhook URL", timestamp: "2 mins ago" },
  { id: 2, user: "System", action: "Workflow automatically saved", timestamp: "1 hour ago" },
  { id: 3, user: "Alice Johnson", action: "Removed legacy SMS Notification action", timestamp: "4 hours ago" },
  { id: 4, user: "Engineering Team", action: "Created workflow", timestamp: "2 days ago" }
]);

export const selectedNodeIdAtom = atom<string | null>(null);
