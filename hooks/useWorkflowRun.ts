'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { nodesAtom, persistedWorkflowIdAtom } from '../store/workflowStore';
import {
  activeRunIdAtom,
  defaultNodeState,
  executionMonitorActiveAtom,
  nodeExecutionFamily,
  runFailureDetailAtom,
  runStatusAtom,
  runStreamErrorAtom,
  runStreamStatusAtom,
} from '../store/executionStore';
import { authClient } from '@/lib/auth/auth-client';
import { startWorkflowRun } from '../lib/workflow/startWorkflowRun';
import { fetchWorkflowRunById } from '../lib/workflow/fetchWorkflowRunById';
import { runWebSocketUrl, waitForWebSocketOpen } from '../lib/socket/runWebSocketUrl';
import type { SaveOutcome } from './useWorkflowSave';

type SaveFn = () => Promise<SaveOutcome>;

function mapSnapshotStatus(s: string): string {
  if (s === 'SUCCESS') return 'SUCCESS';
  if (s === 'FAILED') return 'FAILED';
  if (s === 'RUNNING' || s === 'RETRYING') return 'RUNNING';
  return 'PENDING';
}

function snapshotDurationMs(sr: {
  startedAt?: Date | string | null;
  endedAt?: Date | string | null;
}): number | undefined {
  if (!sr.startedAt || !sr.endedAt) return undefined;
  const a = new Date(sr.startedAt).getTime();
  const b = new Date(sr.endedAt).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return undefined;
  return Math.max(0, b - a);
}

/** DB is source of truth — visible in GET /api/runs/:runId (Network tab). */
async function hydrateRunFailureFromApi(
  runId: string,
  token: string,
  setRunFailureDetail: (value: string | null) => void,
  setRunStatus: (value: 'idle' | 'running' | 'success' | 'failed') => void
): Promise<void> {
  try {
    const detail = await fetchWorkflowRunById(runId, token);
    const run = detail?.run;
    if (!run) return;
    const msg = run.errorMessage;
    if (typeof msg === 'string' && msg.trim() !== '') {
      setRunFailureDetail(msg);
    }
    if (run.status === 'FAILED' || run.status === 'TIMEOUT') {
      setRunStatus('failed');
    }
  } catch {
    /* ignore */
  }
}

/**
 * POST creates a PENDING run; engine starts when this WebSocket connects.
 * Waits for WS `open` before treating the run stream as ready.
 */
export function useWorkflowRun(save: SaveFn) {
  const workflowId = useAtomValue(persistedWorkflowIdAtom);
  const nodes = useAtomValue(nodesAtom);
  const store = useStore();
  const setRunStatus = useSetAtom(runStatusAtom);
  const setActiveRunId = useSetAtom(activeRunIdAtom);
  const setStreamStatus = useSetAtom(runStreamStatusAtom);
  const setStreamError = useSetAtom(runStreamErrorAtom);
  const setRunFailureDetail = useSetAtom(runFailureDetailAtom);
  const setExecutionMonitor = useSetAtom(executionMonitorActiveAtom);

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  const run = useCallback(async () => {
    let wid = workflowId;
    const outcome = await save();
    if (!outcome.ok) return;
    wid = outcome.workflowId;
    if (!wid) return;

    wsRef.current?.close();
    wsRef.current = null;

    setExecutionMonitor(true);
    setStreamStatus('connecting');
    setRunStatus('idle');
    setStreamError(null);
    setRunFailureDetail(null);

    // Clear persisted per-node UI (atomWithStorage) so a failed WS does not show last run's "Completed"
    for (const n of nodes) {
      store.set(nodeExecutionFamily(n.id), { ...defaultNodeState, nodeId: n.id });
    }

    try {
      const { data: tokenData } = await authClient.token();
      const token = tokenData?.token ?? '';
      if (!token) {
        setStreamStatus('error');
        setStreamError('Not signed in — no session token for WebSocket.');
        setRunStatus('failed');
        return;
      }

      const { runId } = await startWorkflowRun({ workflowId: wid, token });
      setActiveRunId(runId);

      const ws = new WebSocket(runWebSocketUrl(runId, token));
      wsRef.current = ws;

      const scheduleHydrateFromDb = (reason: 'complete' | 'close') => {
        void hydrateRunFailureFromApi(runId, token, setRunFailureDetail, setRunStatus).then(() => {
          if (process.env.NODE_ENV === 'development') {
            console.debug(`[useWorkflowRun] hydrated run failure from API (${reason})`, runId);
          }
        });
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data) as {
            type?: string;
            status?: string;
            stepId?: string;
            runId?: string;
            logs?: string;
            error?: string;
            outputs?: Record<string, unknown>;
            durationMs?: number;
            stepRuns?: Array<{
              stepId: string;
              status: string;
              logs?: string | null;
              errorMessage?: string | null;
              outputs?: unknown;
              startedAt?: Date | string | null;
              endedAt?: Date | string | null;
            }>;
          };

          if (msg.type === 'snapshot' && Array.isArray(msg.stepRuns)) {
            for (const sr of msg.stepRuns) {
              const durationMs = snapshotDurationMs(sr);
              window.dispatchEvent(
                new CustomEvent('dag:step', {
                  detail: {
                    stepId: sr.stepId,
                    status: mapSnapshotStatus(sr.status),
                    logs: sr.logs ?? undefined,
                    error: sr.errorMessage ?? undefined,
                    outputs: (sr.outputs as Record<string, unknown>) ?? undefined,
                    durationMs,
                  },
                })
              );
            }
            return;
          }

          if (msg.type === 'step') {
            window.dispatchEvent(new CustomEvent('dag:step', { detail: msg }));
          } else if (msg.type === 'complete') {
            const complete = msg as typeof msg & { error?: string };
            setRunStatus(complete.status === 'SUCCESS' ? 'success' : 'failed');
            if (complete.status !== 'SUCCESS' && typeof complete.error === 'string' && complete.error.trim() !== '') {
              setRunFailureDetail(complete.error);
            } else if (complete.status === 'SUCCESS') {
              setRunFailureDetail(null);
            }
            setStreamStatus('closed');
            if (complete.status !== 'SUCCESS') {
              scheduleHydrateFromDb('complete');
            }
            ws.close();
            wsRef.current = null;
          }
        } catch {
          /* ignore malformed frames */
        }
      };

      ws.onerror = () => {
        setRunStatus('failed');
        setStreamStatus('error');
        wsRef.current = null;
      };

      ws.onclose = (ev) => {
        if (ev.code === 1008) {
          setStreamError(ev.reason?.trim() || 'Unauthorized');
          setRunStatus('failed');
          setStreamStatus('error');
          wsRef.current = null;
          return;
        }
        setStreamStatus((prev) => (prev === 'error' ? 'error' : 'closed'));
        wsRef.current = null;
        scheduleHydrateFromDb('close');
      };

      await waitForWebSocketOpen(ws);

      setStreamStatus('open');
      setRunStatus('running');
    } catch (err) {
      console.error('[useWorkflowRun]', err);
      setRunStatus('failed');
      setStreamStatus('error');
      const base = err instanceof Error ? err.message : 'WebSocket connection failed';
      setStreamError(
        base === 'WebSocket connection failed' || base === 'WebSocket connection timeout'
          ? `${base}. Typical causes: next-ws not applied (run npm install / dev), reverse proxy blocking WS upgrades, or BETTER_AUTH_URL not matching this app URL (JWT issuer).`
          : base
      );
      wsRef.current = null;
    }
  }, [
    workflowId,
    nodes,
    store,
    save,
    setRunStatus,
    setActiveRunId,
    setStreamStatus,
    setStreamError,
    setRunFailureDetail,
    setExecutionMonitor,
  ]);

  return { run };
}
