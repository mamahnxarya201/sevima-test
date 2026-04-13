'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { persistedWorkflowIdAtom } from '../store/workflowStore';
import {
  activeRunIdAtom,
  runStatusAtom,
  isLiveConnectionEnabledAtom,
} from '../store/executionStore';
import { authClient } from '@/lib/auth/auth-client';
import { startWorkflowRun } from '../lib/workflow/startWorkflowRun';
import type { SaveOutcome } from './useWorkflowSave';

type SaveFn = () => Promise<SaveOutcome>;

function runWebSocketUrl(runId: string, token: string) {
  const origin =
    typeof window !== 'undefined'
      ? window.location.origin.replace(/^http/, 'ws')
      : '';
  return `${origin}/api/ws/runs/${runId}?token=${encodeURIComponent(token)}`;
}

/**
 * Starts a workflow run (POST) then streams step/complete events over WebSocket.
 * Dispatches `dag:step` for the canvas; updates run / live atoms.
 */
export function useWorkflowRun(save: SaveFn) {
  const workflowId = useAtomValue(persistedWorkflowIdAtom);
  const setRunStatus = useSetAtom(runStatusAtom);
  const setActiveRunId = useSetAtom(activeRunIdAtom);
  const setLive = useSetAtom(isLiveConnectionEnabledAtom);

  const [running, setRunning] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  const run = useCallback(async () => {
    let wid = workflowId;
    if (!wid) {
      const outcome = await save();
      if (!outcome.ok) return;
      wid = outcome.workflowId;
    }
    if (!wid) return;

    wsRef.current?.close();
    wsRef.current = null;

    setRunning(true);
    setRunStatus('running');

    try {
      const { data: tokenData } = await authClient.token();
      const token = tokenData?.token ?? '';

      const { runId } = await startWorkflowRun({ workflowId: wid, token });

      setActiveRunId(runId);
      setLive(true);

      const ws = new WebSocket(runWebSocketUrl(runId, token));
      wsRef.current = ws;

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data) as {
            type?: string;
            status?: string;
          };

          if (msg.type === 'step') {
            window.dispatchEvent(new CustomEvent('dag:step', { detail: msg }));
          } else if (msg.type === 'complete') {
            setRunStatus(msg.status === 'SUCCESS' ? 'success' : 'failed');
            setLive(false);
            ws.close();
            setRunning(false);
            wsRef.current = null;
          }
        } catch {
          /* ignore malformed frames */
        }
      };

      ws.onerror = () => {
        setRunStatus('failed');
        setRunning(false);
        setLive(false);
        wsRef.current = null;
      };
    } catch (err) {
      console.error('[useWorkflowRun]', err);
      setRunStatus('failed');
      setRunning(false);
      setLive(false);
    }
  }, [workflowId, save, setRunStatus, setActiveRunId, setLive]);

  return { run, running };
}
