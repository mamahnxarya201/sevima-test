import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';

export type ExecutionStatus = 'running' | 'success' | 'failed' | 'idle';

/**
 * Strict TypeScript contract for inbound WebSocket DAG payloads.
 * By enforcing this interface, the backend engine can reliably stream partial or complete
 * node updates to the visualization layer.
 */
export interface DAGExecutionPayload {
  nodeId: string;
  status: ExecutionStatus;
  logs?: string[];
  error?: string;
  progress?: number; // Optional 0 to 100 for granular node task visualization
  isLoading?: boolean; // For initial skeleton phase before DAG initializes
}

export const defaultNodeState: DAGExecutionPayload = {
  nodeId: '',
  status: 'idle',
};

/**
 * Jotai atomFamily ensures high-performance O(1) subscriptions.
 * A specific node simply mounts `const [state] = useAtom(nodeExecutionFamily('node_xyz'))`
 * and ONLY re-renders when this specific atom receives an update (e.g. from the WebSocket).
 */
export const nodeExecutionFamily = atomFamily((id: string) => 
  atom<DAGExecutionPayload>({ ...defaultNodeState, nodeId: id })
);

// We can also have an overarching selector if we ever need to calculate total workflow % complete

export const isLiveConnectionEnabledAtom = atom(false);
