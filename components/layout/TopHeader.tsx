'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { MaterialIcon } from '../ui/MaterialIcon';
import { LiveConnectionToggle } from '../ui/LiveConnectionToggle';
import { HistoryPopup } from '../ui/HistoryPopup';
import {
  workflowTitleAtom,
  workflowLastUpdatedAtom,
  tenantNameAtom,
  persistedWorkflowIdAtom,
  workflowSavingAtom,
  workflowSaveErrorAtom,
} from '../../store/workflowStore';
import { runStatusAtom } from '../../store/executionStore';
import { useWorkflowDebugger } from '../../hooks/useWorkflowDebugger';
import { useWorkflowSync } from '../../hooks/useWorkflowSync';
import { useWorkflowSave } from '../../hooks/useWorkflowSave';
import { useWorkflowRun } from '../../hooks/useWorkflowRun';
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

  const runStatus = useAtomValue(runStatusAtom);

  const saving = useAtomValue(workflowSavingAtom);
  const saveError = useAtomValue(workflowSaveErrorAtom);

  const workflowId = useAtomValue(persistedWorkflowIdAtom);
  const { save } = useWorkflowSave();
  const { run: runWorkflow, running } = useWorkflowRun(save);

  const syncStatus = useWorkflowSync(workflowId);
  const [showDebugger, setShowDebugger] = useState(false);
  const debuggerData = useWorkflowDebugger();

  const handleSave = useCallback(async () => {
    await save();
  }, [save]);

  useEffect(() => {
    if (!showDebugger) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowDebugger(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showDebugger]);

  // ── Render ─ten─n─Name─────────────────────────────────────────────────────────

  return (
    <header className="w-full sticky top-0 z-50 flex justify-between items-center px-6 py-3 bg-stone-50/80 backdrop-blur-md shadow-sm border-b border-stone-200/50">
      <div className="flex items-center gap-6">
        <Link
          href="/workflows"
          className="p-1.5 rounded-xl flex items-center justify-center text-[#3a6095] hover:bg-[#e0e4dc]/80 transition-colors"
          title="Back to workflows"
        >
          <MaterialIcon icon="arrow_back" />
        </Link>

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
      </div>

      <div className="flex items-center gap-3">
        {/* Sync Status */}
        {syncStatus === 'syncing' && <span className="text-xs font-semibold text-stone-500 animate-pulse">Syncing...</span>}
        {syncStatus === 'synced' && <span className="text-xs font-semibold text-emerald-600">Synced</span>}
        {syncStatus === 'error' && <span className="text-xs font-semibold text-red-600">Sync Error</span>}

        {/* Debug JSON */}
        <button
          onClick={() => setShowDebugger(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 text-sm font-semibold transition-all shadow-sm"
        >
          <MaterialIcon icon="bug_report" className="text-base" />
          Debug JSON
        </button>

        {/* Run status badge */}
        {runStatus !== 'idle' && (
          <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${STATUS_STYLES[runStatus]}`}>
            {STATUS_LABELS[runStatus]}
          </span>
        )}

        <LiveConnectionToggle />

        {/* Save Version */}
        <div className="flex flex-col items-end gap-0.5">
          <button
            id="save-workflow-btn"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 text-sm font-semibold transition-all disabled:opacity-50 shadow-sm"
          >
            <MaterialIcon icon="save" className="text-base" />
            {saving ? 'Saving…' : 'Save'}
          </button>
          {saveError && (
            <span className="text-[10px] font-semibold text-red-600 max-w-[14rem] text-right leading-tight" title={saveError}>
              {saveError}
            </span>
          )}
        </div>

        {/* Run Workflow */}
        <button
          id="run-workflow-btn"
          onClick={() => void runWorkflow()}
          disabled={running}
          className="flex items-center gap-1.5 bg-[#3a6095] text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors hover:bg-[#2c4c77] active:bg-[#264060] disabled:opacity-60"
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

        <div className="w-8 h-8 rounded-full bg-[#e0e4dc] ring-2 ring-[#afb3ac]/20 shadow-sm flex items-center justify-center text-[#3a6095] text-xs font-bold">
          ET
        </div>
      </div>

      {/* Portal: escape sticky header stacking so overlay is viewport-centered */}
      {showDebugger &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="debug-json-title"
          >
            <button
              type="button"
              className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
              aria-label="Close debug panel"
              onClick={() => setShowDebugger(false)}
            />
            <div
              className="relative z-10 flex w-full max-w-4xl max-h-[min(90vh,56rem)] min-h-0 flex-col overflow-hidden rounded-[1.5rem] border border-[#afb3ac]/20 bg-[#fafaf5] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-[#afb3ac]/15 bg-[#f3f4ee] px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e0e4dc] text-[#3a6095]">
                    <MaterialIcon icon="bug_report" className="text-lg" />
                  </div>
                  <h2 id="debug-json-title" className="font-['Manrope'] text-[16px] font-bold text-[#2f342e]">
                    Debug JSON
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDebugger(false)}
                  className="px-4 py-2 text-[13px] font-bold text-[#afb3ac] transition-colors hover:text-[#2f342e]"
                >
                  Close
                </button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#2f342e] p-6">
                <div className="mb-4 shrink-0">
                  {debuggerData.isValid ? (
                    <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/20 px-3 py-1.5 text-xs font-bold text-emerald-400">
                      Valid DAG
                    </span>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <span className="self-start rounded-lg border border-red-500/30 bg-red-500/20 px-3 py-1.5 text-xs font-bold text-red-400">
                        Invalid DAG
                      </span>
                      <ul className="list-disc pl-4 text-xs text-red-400">
                        {debuggerData.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <pre className="min-h-0 flex-1 overflow-auto font-mono text-[13px] leading-[1.6] text-[#fafaf5]">
                  {debuggerData.json}
                </pre>
              </div>
            </div>
          </div>,
          document.body
        )}
    </header>
  );
};
