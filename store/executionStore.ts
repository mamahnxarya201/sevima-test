import { atom } from 'jotai';
import { atomFamily, atomWithStorage } from 'jotai/utils';

export type ExecutionStatus = 'running' | 'success' | 'failed' | 'idle' | 'retrying';

/**
 * Strict TypeScript contract for inbound WebSocket DAG payloads.
 * Driven by real step:update events from the execution engine.
 */
export interface DAGExecutionPayload {
  nodeId: string;
  status: ExecutionStatus;
  logs?: string;
  error?: string;
  progress?: number;
  isLoading?: boolean;
  outputs?: Record<string, unknown>;
  /** Step duration (runner / WS); snapshot may derive from startedAt/endedAt */
  durationMs?: number;
}

export const defaultNodeState: DAGExecutionPayload = {
  nodeId: '',
  status: 'idle',
};

/**
 * Jotai atomFamily — O(1) per-node subscriptions.
 * Each node only re-renders when its own atom is updated.
 */
export const nodeExecutionFamily = atomFamily((id: string) =>
  atomWithStorage<DAGExecutionPayload>(`node-exec-${id}`, { ...defaultNodeState, nodeId: id })
);

/** @deprecated Canvas sync toggle; run stream uses runStreamStatusAtom */
export const isLiveConnectionEnabledAtom = atom(false);

/** Run WebSocket: idle | connecting | open | error | closed */
export type RunStreamStatus = 'idle' | 'connecting' | 'open' | 'error' | 'closed';
export const runStreamStatusAtom = atom<RunStreamStatus>('idle');

/** Last run-stream failure (e.g. WebSocket error); cleared when a new run starts */
export const runStreamErrorAtom = atom<string | null>(null);

/** True after Run Workflow — show ExecutionSidebar until user dismisses */
export const executionMonitorActiveAtom = atom(false);

/** The active run ID being streamed */
export const activeRunIdAtom = atom<string | null>(null);

/** Overall run status for the header badge */
export type RunStatus = 'idle' | 'running' | 'success' | 'failed';
export const runStatusAtom = atom<RunStatus>('idle');
