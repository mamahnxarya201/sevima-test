'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { MaterialIcon } from '../ui/MaterialIcon';
import { HistoryPopup } from '../ui/HistoryPopup';
import { WorkflowSettingsDialog } from '../ui/WorkflowSettingsDialog';
import {
  workflowTitleAtom,
  workflowLastUpdatedAtom,
  tenantNameAtom,
  tenantIdAtom,
  workflowSavingAtom,
  workflowSaveErrorAtom,
  workflowCheckpointingAtom,
  workflowActiveVersionAtom,
  workflowCreatorAtom,
  persistedWorkflowIdAtom,
  workflowPendingVersionLoadAtom,
  workflowViewingVersionAtom,
} from '../../store/workflowStore';
import {
  runFailureDetailAtom,
  runStatusAtom,
  runStreamStatusAtom,
  type RunStreamStatus,
} from '../../store/executionStore';
import { useWorkflowDebugger } from '../../hooks/useWorkflowDebugger';
import { useWorkflowSave } from '../../hooks/useWorkflowSave';
import { useWorkflowRun } from '../../hooks/useWorkflowRun';
import { authClient } from '@/lib/auth/auth-client';
import type { RunStatus } from '../../store/executionStore';
import { useRolePermissions } from '@/hooks/useRolePermissions';

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

const STREAM_LABELS: Record<RunStreamStatus, string> = {
  idle: 'Run stream off',
  connecting: 'Connecting…',
  open: 'Run stream live',
  error: 'Run stream error',
  closed: 'Run stream ended',
};

// ─── Component ─────────────────────────────────────────────────────────────

export const TopHeader = () => {
  const [title, setTitle] = useAtom(workflowTitleAtom);
  const [lastUpdated] = useAtom(workflowLastUpdatedAtom);
  const [showHistory, setShowHistory] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const setTenantName = useSetAtom(tenantNameAtom);
  const setTenantId = useSetAtom(tenantIdAtom);

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
        if (data.tenant?.id) {
          setTenantId(data.tenant.id);
        }
      } catch (err) {
        console.error('[TopHeader] Failed to fetch tenant name:', err);
        setTenantName('FlowForge');
      }
    }

    fetchTenantName();
  }, [setTenantName, setTenantId]);

  const runStatus = useAtomValue(runStatusAtom);
  const runStreamStatus = useAtomValue(runStreamStatusAtom);
  const runFailureDetail = useAtomValue(runFailureDetailAtom);

  const saving = useAtomValue(workflowSavingAtom);
  const saveError = useAtomValue(workflowSaveErrorAtom);
  const checkpointing = useAtomValue(workflowCheckpointingAtom);
  const activeVersion = useAtomValue(workflowActiveVersionAtom);
  const workflowCreator = useAtomValue(workflowCreatorAtom);
  const persistedWorkflowId = useAtomValue(persistedWorkflowIdAtom);
  const setPendingVersionLoad = useSetAtom(workflowPendingVersionLoadAtom);
  const viewingVersion = useAtomValue(workflowViewingVersionAtom);

  const { save, checkpoint } = useWorkflowSave();
  const { run: runWorkflow } = useWorkflowRun(save);

  const runBusy = runStatus === 'running' || runStreamStatus === 'connecting';
  const { canEdit, role } = useRolePermissions();

  const [showSettings, setShowSettings] = useState(false);
  const [showDebugger, setShowDebugger] = useState(false);
  const debuggerData = useWorkflowDebugger();

  useEffect(() => {
    if (!showDebugger) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowDebugger(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showDebugger]);

  useEffect(() => {
    if (!showHistory) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowHistory(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showHistory]);

  useEffect(() => {
    if (!showHistory) return;
    const onDown = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showHistory]);

  // ── Render ─ten─n─Name─────────────────────────────────────────────────────────

  return (
    <header className="w-full sticky top-0 z-50 flex justify-between items-center px-6 py-3 bg-[#fafaf5]/45 backdrop-blur-[20px] backdrop-saturate-150 shadow-[0_8px_32px_rgba(47,52,46,0.04)] border-b border-[#afb3ac]/12">
      <div className="flex items-center gap-6">
        <Link
          href="/workflows"
          className="p-1.5 rounded-xl flex items-center justify-center text-[#3a6095] hover:bg-[#e0e4dc]/80 transition-colors"
          title="Back to workflows"
        >
          <MaterialIcon icon="arrow_back" />
        </Link>

        <div ref={historyRef} className="relative flex flex-col justify-center">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled workflow"
            readOnly={!canEdit}
            className={`text-xl font-bold tracking-tight text-stone-800 bg-transparent border-none outline-none px-2 py-0.5 rounded transition-all w-80 ${
              canEdit
                ? 'hover:bg-stone-200/50 focus:bg-stone-200/50'
                : 'opacity-80 cursor-default'
            }`}
          />
          <button
            type="button"
            title="Version history — checkpoints are immutable snapshots"
            onClick={() => setShowHistory((open) => !open)}
            className="flex w-max max-w-[min(100vw-4rem,28rem)] flex-wrap items-center gap-x-1 gap-y-0.5 rounded px-2 py-0.5 text-left text-[11px] font-semibold text-stone-500 transition-colors hover:bg-stone-100/80 hover:text-blue-600"
          >
            <span
              className="truncate"
              title={workflowCreator?.email ? `Email: ${workflowCreator.email}` : undefined}
            >
              Created by {workflowCreator?.name?.trim() || 'Unknown'}
            </span>
            <span className="inline-block h-1 w-1 shrink-0 rounded-full bg-stone-400" aria-hidden />
            <span>Updated {lastUpdated}</span>
            {activeVersion != null && (
              <>
                <span className="inline-block h-1 w-1 shrink-0 rounded-full bg-stone-400" aria-hidden />
                <span className="rounded bg-stone-200/80 px-1.5 py-0.5 font-mono text-[10px] text-stone-600">
                  v{activeVersion}
                </span>
              </>
            )}
            {viewingVersion != null && (
              <>
                <span className="inline-block h-1 w-1 shrink-0 rounded-full bg-stone-400" aria-hidden />
                <span className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-blue-700">
                  Viewing v{viewingVersion}
                </span>
              </>
            )}
            <MaterialIcon icon="history" className="ml-0.5 shrink-0 text-[14px]" aria-hidden />
          </button>
          {showHistory && (
            <HistoryPopup
              onClose={() => setShowHistory(false)}
              onSelectVersion={(vn) => {
                setPendingVersionLoad(vn);
                setShowHistory(false);
              }}
            />
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span
          className={`rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${
            canEdit ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-200 text-stone-600'
          }`}
          title="Current access level for workflow actions"
        >
          {canEdit ? `${role.toLowerCase()} mode` : 'viewer mode'}
        </span>
        {/* Run stream (WebSocket) + autosave hint */}
        <div className="flex flex-col items-end gap-0.5 mr-1">
          <span
            className={`text-[11px] font-semibold ${
              runStreamStatus === 'open'
                ? 'text-emerald-600'
                : runStreamStatus === 'connecting'
                  ? 'text-stone-500 animate-pulse'
                  : runStreamStatus === 'error'
                    ? 'text-red-600'
                    : 'text-stone-400'
            }`}
            title="Connection to /api/ws/runs/:runId during a workflow run"
          >
            {STREAM_LABELS[runStreamStatus]}
          </span>
          {saving && (
            <span className="text-[10px] font-semibold text-stone-400">Saving draft…</span>
          )}
          {checkpointing && (
            <span className="text-[10px] font-semibold text-stone-400">Creating checkpoint…</span>
          )}
          {saveError && !saving && !checkpointing && (
            <span className="text-[10px] font-semibold text-red-600 max-w-[12rem] text-right truncate" title={saveError}>
              {saveError}
            </span>
          )}
        </div>

        {canEdit && (
          <button
            type="button"
            title="Save an immutable version snapshot (numbered). Edits still auto-save as draft on the latest version."
            onClick={() => void checkpoint()}
            disabled={checkpointing || saving || !persistedWorkflowId}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 text-sm font-semibold transition-all shadow-sm disabled:opacity-50 disabled:pointer-events-none"
          >
            <MaterialIcon icon="bookmark_add" className={`text-base ${checkpointing ? 'animate-pulse' : ''}`} />
            Checkpoint
          </button>
        )}

        {/* Workflow Settings */}
        {canEdit && (
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 text-sm font-semibold transition-all shadow-sm"
          >
            <MaterialIcon icon="tune" className="text-base" />
            Settings
          </button>
        )}

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
          <div className="flex max-w-[min(24rem,40vw)] flex-col items-end gap-1">
            <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${STATUS_STYLES[runStatus]}`}>
              {STATUS_LABELS[runStatus]}
            </span>
            {runStatus === 'failed' && runFailureDetail && (
              <p
                className="max-h-24 overflow-y-auto rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-left text-[10px] font-medium leading-snug text-red-900"
                title={runFailureDetail}
              >
                {runFailureDetail}
              </p>
            )}
          </div>
        )}

        {/* Run Workflow */}
        {canEdit && (
          <button
            id="run-workflow-btn"
            onClick={() => void runWorkflow()}
            disabled={runBusy}
            className="flex items-center gap-1.5 bg-[#3a6095] text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors hover:bg-[#2c4c77] active:bg-[#264060] disabled:opacity-60"
          >
            <MaterialIcon icon={runBusy ? 'sync' : 'play_arrow'} className={`text-base ${runBusy ? 'animate-spin' : ''}`} />
            {runBusy ? 'Starting…' : 'Run Workflow'}
          </button>
        )}

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

      <WorkflowSettingsDialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        canEdit={canEdit}
      />
    </header>
  );
};
