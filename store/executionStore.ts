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

/** Whether a live WebSocket run stream is connected */
export const isLiveConnectionEnabledAtom = atom(false);

/** The active run ID being streamed */
export const activeRunIdAtom = atom<string | null>(null);

/** Overall run status for the header badge */
export type RunStatus = 'idle' | 'running' | 'success' | 'failed';
export const runStatusAtom = atom<RunStatus>('idle');
