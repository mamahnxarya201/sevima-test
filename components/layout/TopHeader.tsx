'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useReactFlow } from '@xyflow/react';
import { MaterialIcon } from '../ui/MaterialIcon';
import { LiveConnectionToggle } from '../ui/LiveConnectionToggle';
import { HistoryPopup } from '../ui/HistoryPopup';
import {
  workflowTitleAtom,
  workflowLastUpdatedAtom,
  isSidebarOpenAtom,
  tenantNameAtom,
} from '../../store/workflowStore';
import {
  activeRunIdAtom,
  runStatusAtom,
  nodeExecutionFamily,
  isLiveConnectionEnabledAtom,
} from '../../store/executionStore';
import { exportCanvasToDag } from '../../lib/canvas/dagExporter';
import { authClient } from '@/lib/auth/auth-client';
import type { RunStatus } from '../../store/executionStore';

// ─── Run status badge ──────────────────────────────────────────────────────

const STATUS_STYLES: Record<RunStatus, string> = {
  idle: 'bg-stone-100 text-stone-500',
  running: 'bg-blue-50 text-blue-600 animate-pulse',
  success: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-red-50 text-red-600',
};

const STATUS_LABELS: Record<RunStatus, string> = {
  idle: 'Not running',
  running: '⟳ Running…',
  success: '✓ Succeeded',
  failed: '✕ Failed',
};

// ─── Component ─────────────────────────────────────────────────────────────

export const TopHeader = () => {
  const [title, setTitle] = useAtom(workflowTitleAtom);
  const [lastUpdated] = useAtom(workflowLastUpdatedAtom);
  const [isSidebarOpen, setIsSidebarOpen] = useAtom(isSidebarOpenAtom);
  const [showHistory, setShowHistory] = useState(false);
  const tenantName = useAtomValue(tenantNameAtom);
  const setTenantName = useSetAtom(tenantNameAtom);

  useEffect(() => {
    async function fetchTenantName() {
      try {
        const { data: tokenData } = await authClient.token();
        const token = tokenData?.token;

        if (!token) {
          setTenantName('FlowForge');
          return;
        }

        const res = await fetch('/api/tenants', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.tenant?.name) {
          setTenantName(data.tenant.name);
        }
      } catch (err) {
        console.error('[TopHeader] Failed to fetch tenant name:', err);
        setTenantName('FlowForge');
      }
    }

    fetchTenantName();
  }, [setTenantName]);

  // Run state
  const runStatus = useAtomValue(runStatusAtom);
  const setRunStatus = useSetAtom(runStatusAtom);
  const setActiveRunId = useSetAtom(activeRunIdAtom);
  const setLive = useSetAtom(isLiveConnectionEnabledAtom);

  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const { getNodes, getEdges } = useReactFlow();

  // ── Helpers ──────────────────────────────────────────────────────────────

  function getAuthToken(): string {
    return typeof window !== 'undefined'
      ? localStorage.getItem('better-auth.token') ?? ''
      : '';
  }

  // Get or create a workflow ID (simplified: stored in localStorage for MVP)
  function getWorkflowId(): string | null {
    return typeof window !== 'undefined'
      ? localStorage.getItem('workflow_id')
      : null;
  }

  // ── Save version ──────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const nodes = getNodes();
      const edges = getEdges();
      const definition = exportCanvasToDag(title, nodes, edges);
      const token = getAuthToken();
      const workflowId = getWorkflowId();

      let response: Response;
      if (workflowId) {
        response = await fetch(`/api/workflows/${workflowId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: title, definition }),
        });
      } else {
        response = await fetch('/api/workflows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: title, definition }),
        });
        const data = await response.json();
        if (data.workflow?.id) {
          localStorage.setItem('workflow_id', data.workflow.id);
        }
      }

      if (!response.ok) throw new Error('Save failed');
    } catch (err) {
      console.error('[TopHeader] Save failed:', err);
    } finally {
      setSaving(false);
    }
  }, [title, getNodes, getEdges]);

  // ── Run workflow ──────────────────────────────────────────────────────────

  const handleRun = useCallback(async () => {
    let workflowId = getWorkflowId();
    if (!workflowId) {
      // Auto-save first
      await handleSave();
      workflowId = getWorkflowId();
    }
    if (!workflowId) return;

    setRunning(true);
    setRunStatus('running');

    try {
      const token = getAuthToken();
      const res = await fetch(`/api/workflows/${workflowId}/run`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const { runId, error } = await res.json();
      if (!res.ok || !runId) throw new Error(error ?? 'Run failed');

      setActiveRunId(runId);
      setLive(true);

      // Connect WebSocket
      const wsUrl = `${window.location.origin.replace('http', 'ws')}/api/ws/runs/${runId}?token=${token}`;
      const ws = new WebSocket(wsUrl);

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);

          if (msg.type === 'snapshot') {
            // Snapshot handled by LogDrawer; don't update atoms here to avoid flash
          } else if (msg.type === 'step') {
            // Update is handled by page.tsx nodeExecutionFamily setters
            // Dispatch a custom browser event so page.tsx can pick it up
            window.dispatchEvent(new CustomEvent('dag:step', { detail: msg }));
          } else if (msg.type === 'complete') {
            setRunStatus(msg.status === 'SUCCESS' ? 'success' : 'failed');
            setLive(false);
            ws.close();
            setRunning(false);
          }
        } catch {}
      };

      ws.onerror = () => {
        setRunStatus('failed');
        setRunning(false);
        setLive(false);
      };
    } catch (err) {
      console.error('[TopHeader] Run failed:', err);
      setRunStatus('failed');
      setRunning(false);
    }
  }, [handleSave, setRunStatus, setActiveRunId, setLive]);

  // ── Render ─ten─n─Name─────────────────────────────────────────────────────────

  return (
    <header className="w-full sticky top-0 z-50 flex justify-between items-center px-6 py-3 bg-stone-50/80 backdrop-blur-md shadow-sm border-b border-stone-200/50">
      <div className="flex items-center gap-6">
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className={`p-1.5 rounded-lg transition-colors flex items-center justify-center ${isSidebarOpen ? 'text-stone-500 hover:bg-stone-200' : 'bg-stone-200 text-stone-800 shadow-sm'}`}
          title="Toggle Sidebar"
        >
          <MaterialIcon icon={isSidebarOpen ? 'menu_open' : 'menu'} />
        </button>

        <div className="relative flex flex-col justify-center">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-xl font-bold tracking-tight text-stone-800 bg-transparent border-none outline-none hover:bg-stone-200/50 focus:bg-stone-200/50 px-2 py-0.5 rounded transition-all w-80"
          />
          <div
            onClick={() => setShowHistory(!showHistory)}
            className="text-[11px] font-semibold text-stone-500 hover:text-blue-600 transition-colors flex items-center gap-1 cursor-pointer px-2 py-0.5 rounded w-max"
          >
            By {tenantName} <span className="w-1 h-1 rounded-full bg-stone-400 inline-block" /> Last updated {lastUpdated}
            <MaterialIcon icon="history" className="text-[14px] ml-0.5" />
          </div>
          {showHistory && <HistoryPopup onClose={() => setShowHistory(false)} />}
        </div>

        <div className="hidden md:flex gap-6 ml-4">
          <a className="text-stone-500 hover:text-stone-800 transition-colors text-sm font-semibold" href="#">Workflows</a>
          <a className="text-stone-500 hover:text-stone-800 transition-colors text-sm" href="#">Executions</a>
          <a className="text-stone-500 hover:text-stone-800 transition-colors text-sm" href="#">Settings</a>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Run status badge */}
        {runStatus !== 'idle' && (
          <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${STATUS_STYLES[runStatus]}`}>
            {STATUS_LABELS[runStatus]}
          </span>
        )}

        <LiveConnectionToggle />

        {/* Save Version */}
        <button
          id="save-workflow-btn"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 text-sm font-semibold transition-all disabled:opacity-50 shadow-sm"
        >
          <MaterialIcon icon="save" className="text-base" />
          {saving ? 'Saving…' : 'Save'}
        </button>

        {/* Run Workflow */}
        <button
          id="run-workflow-btn"
          onClick={handleRun}
          disabled={running}
          className="flex items-center gap-1.5 bg-gradient-to-br from-blue-700 to-blue-500 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:scale-[0.98] active:scale-95 transition-transform disabled:opacity-60"
        >
          <MaterialIcon icon={running ? 'sync' : 'play_arrow'} className={`text-base ${running ? 'animate-spin' : ''}`} />
          {running ? 'Running…' : 'Run Workflow'}
        </button>

        <div className="flex items-center gap-2 pl-2 border-l border-stone-200">
          <button className="p-2 text-stone-500 hover:text-stone-800 transition-colors">
            <MaterialIcon icon="help" />
          </button>
          <button className="p-2 text-stone-500 hover:text-stone-800 transition-colors relative">
            <MaterialIcon icon="notifications" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-600 rounded-full" />
          </button>
        </div>

        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-stone-400 to-stone-300 ring-2 ring-stone-200 shadow-sm flex items-center justify-center text-white text-xs font-bold">
          ET
        </div>
      </div>
    </header>
  );
};
