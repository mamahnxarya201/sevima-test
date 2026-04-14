'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAtomValue } from 'jotai';
import type { Node } from '@xyflow/react';
import {
  nodeExecutionFamily,
  runStreamErrorAtom,
  runStreamStatusAtom,
  type DAGExecutionPayload,
  type ExecutionStatus,
} from '../../store/executionStore';
import { MaterialIcon } from './MaterialIcon';
import { nodeHeaderTitle } from '@/lib/canvas/nodePresentation';
import { authClient } from '@/lib/auth/auth-client';
import {
  fetchWorkflowRuns,
  type WorkflowRunListItem,
  type WorkflowRunStepSnapshot,
  type WorkflowRunsListResponse,
} from '@/lib/workflow/fetchWorkflowRuns';
import { sortWorkflowRunsLatestFirst } from '@/lib/workflow/runHistorySort';
import { formatRelativeTime } from '@/lib/datetime/formatRelativeTime';

function formatDuration(ms: number | undefined): string {
  if (ms == null || Number.isNaN(ms)) return '';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function mapDbStepStatus(status: string): ExecutionStatus {
  if (status === 'SUCCESS') return 'success';
  if (status === 'FAILED') return 'failed';
  if (status === 'RUNNING' || status === 'RETRYING') return 'running';
  return 'idle';
}

function stepSnapshotDurationMs(sr: WorkflowRunStepSnapshot): number | undefined {
  if (!sr.startedAt || !sr.endedAt) return undefined;
  const a = new Date(sr.startedAt).getTime();
  const b = new Date(sr.endedAt).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return undefined;
  return Math.max(0, b - a);
}

function stepSnapshotToPayload(sr: WorkflowRunStepSnapshot): DAGExecutionPayload {
  return {
    nodeId: sr.stepId,
    status: mapDbStepStatus(sr.status),
    logs: sr.logs ?? undefined,
    error: sr.errorMessage ?? undefined,
    outputs: (sr.outputs as Record<string, unknown>) ?? undefined,
    durationMs: stepSnapshotDurationMs(sr),
  };
}

function summarizeRun(stepRuns: { status: string }[]) {
  let success = 0;
  let failed = 0;
  for (const s of stepRuns) {
    if (s.status === 'SUCCESS') success++;
    else if (s.status === 'FAILED') failed++;
  }
  return { success, failed, total: stepRuns.length };
}

function StepRowBody({
  state,
  headerTitle,
  isLast,
}: {
  state: DAGExecutionPayload;
  headerTitle: string;
  isLast: boolean;
}) {
  const [open, setOpen] = useState(false);

  let dotColor = 'bg-[#afb3ac]';
  let lineColor = 'bg-[#edefe8]';
  let statusText = 'Pending';
  let statusColor = 'text-[#afb3ac]';
  let subtitle = 'Waiting…';

  if (state.status === 'success') {
    dotColor = 'bg-emerald-500';
    lineColor = 'bg-emerald-500';
    statusColor = 'text-emerald-600';
    statusText = formatDuration(state.durationMs)
      ? `Completed in ${formatDuration(state.durationMs)}`
      : 'Completed';
    subtitle = state.logs?.slice(0, 120) || 'Finished';
  } else if (state.status === 'running' || state.status === 'retrying') {
    dotColor = 'bg-[#3a6095] ring-4 ring-[#9ec2fe]/30';
    lineColor = 'bg-[#edefe8]';
    statusText = 'Running…';
    statusColor = 'text-[#3a6095]';
    subtitle = state.logs?.slice(0, 120) || 'Executing…';
  } else if (state.status === 'failed') {
    dotColor = 'bg-[#a83836]';
    lineColor = 'bg-[#edefe8]';
    statusText = 'Failed';
    statusColor = 'text-[#a83836]';
    subtitle = state.error || 'Execution failed';
  }

  const hasDetails =
    (state.outputs && Object.keys(state.outputs).length > 0) ||
    (state.logs && state.logs.length > 0) ||
    state.error;

  return (
    <div className="relative pb-8 pl-8">
      {!isLast && (
        <div className={`absolute bottom-0 left-[11px] top-4 w-[2px] rounded-full ${lineColor}`} />
      )}

      <div className={`absolute left-[7px] top-1.5 h-2.5 w-2.5 rounded-full ${dotColor}`} />

      <div className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#afb3ac]">{headerTitle}</span>
          {hasDetails && (
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="flex shrink-0 items-center gap-0.5 rounded-lg px-2 py-1 text-[11px] font-bold text-[#3a6095] transition-colors hover:bg-[#edefe8]"
              aria-expanded={open}
            >
              Details
              <MaterialIcon icon={open ? 'expand_less' : 'expand_more'} className="text-[16px]" />
            </button>
          )}
        </div>
        <span className="line-clamp-2 text-[12px] text-[#2f342e]/70">{subtitle}</span>
        <div className="flex items-center justify-between">
          <span className={`text-[12px] font-semibold ${statusColor}`}>{statusText}</span>
        </div>

        {state.status === 'running' && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#edefe8]">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-[#3a6095]" />
          </div>
        )}

        {open && hasDetails && (
          <div className="mt-3 max-h-64 space-y-3 overflow-y-auto rounded-[1rem] bg-[#edefe8] p-4">
            {state.outputs && Object.keys(state.outputs).length > 0 && (
              <div>
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#afb3ac]">
                  Outputs
                </span>
                <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-[#2f342e]">
                  {JSON.stringify(state.outputs, null, 2)}
                </pre>
              </div>
            )}
            {state.logs && (
              <div>
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#afb3ac]">
                  Logs
                </span>
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-[#2f342e]/90">
                  {state.logs}
                </pre>
              </div>
            )}
            {state.error && (
              <div>
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#a83836]">
                  Error
                </span>
                <p className="text-[12px] text-[#a83836]">{state.error}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LiveTimelineItem({ node, isLast }: { node: Node; isLast: boolean }) {
  const state = useAtomValue(nodeExecutionFamily(node.id));
  const headerTitle = nodeHeaderTitle(String(node.type));
  return <StepRowBody state={{ ...state, nodeId: node.id }} headerTitle={headerTitle} isLast={isLast} />;
}

function StaticTimelineItem({
  node,
  step,
  isLast,
}: {
  node: Node;
  step: WorkflowRunStepSnapshot | undefined;
  isLast: boolean;
}) {
  const headerTitle = nodeHeaderTitle(String(node.type));
  const state: DAGExecutionPayload = step
    ? stepSnapshotToPayload(step)
    : {
        nodeId: node.id,
        status: 'idle',
        logs: undefined,
        error: undefined,
        outputs: undefined,
      };
  return <StepRowBody state={state} headerTitle={headerTitle} isLast={isLast} />;
}

function RunHistoryBlock({
  run,
  nodes,
  title,
}: {
  run: WorkflowRunListItem;
  nodes: Node[];
  title: string;
}) {
  const byStep = new Map(run.stepRuns.map((s) => [s.stepId, s]));
  const { success, failed, total } = summarizeRun(run.stepRuns);

  return (
    <div className="rounded-[1.25rem] border border-[#afb3ac]/15 bg-[#fafaf5] p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[12px] font-bold text-[#2f342e]">{title}</span>
        <span className="text-[11px] font-semibold text-[#2f342e]/70">
          {success} ok · {failed} failed · {total} steps
        </span>
      </div>
      <div className="flex flex-col">
        {nodes.map((node, i) => (
          <StaticTimelineItem
            key={`${run.id}-${node.id}`}
            node={node}
            step={byStep.get(node.id)}
            isLast={i === nodes.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

export const ExecutionSidebar = ({
  nodes,
  workflowId,
  onClose,
  runLocked,
}: {
  nodes: Node[];
  /** Used to load run history summaries */
  workflowId: string | null;
  onClose: () => void;
  /** True while workflow run is in progress — close disabled */
  runLocked: boolean;
}) => {
  const streamStatus = useAtomValue(runStreamStatusAtom);
  const streamError = useAtomValue(runStreamErrorAtom);
  const streamFailed = streamStatus === 'error';

  const [runHistory, setRunHistory] = useState<WorkflowRunsListResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPopupOpen, setHistoryPopupOpen] = useState(false);
  const wasRunLocked = React.useRef(runLocked);

  const loadRuns = useCallback(async () => {
    if (!workflowId) {
      setRunHistory(null);
      return;
    }
    setHistoryLoading(true);
    try {
      const { data: tokenData } = await authClient.token();
      const token = tokenData?.token ?? '';
      if (!token) {
        setRunHistory(null);
        return;
      }
      const res = await fetchWorkflowRuns(workflowId, token, { limit: 25, offset: 0 });
      setRunHistory(res);
    } finally {
      setHistoryLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    if (wasRunLocked.current && !runLocked) {
      void loadRuns();
    }
    wasRunLocked.current = runLocked;
  }, [runLocked, loadRuns]);

  useEffect(() => {
    if (!historyPopupOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHistoryPopupOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [historyPopupOpen]);

  const sortedRuns = useMemo(
    () => (runHistory?.runs?.length ? sortWorkflowRunsLatestFirst(runHistory.runs) : []),
    [runHistory]
  );

  const latestRun = sortedRuns[0];
  const latestSummary = latestRun ? summarizeRun(latestRun.stepRuns) : null;

  const runTimeLabel = (run: WorkflowRunListItem) => {
    const iso = run.endedAt ?? run.startedAt;
    return iso ? formatRelativeTime(iso) : '—';
  };

  return (
    <div className="z-10 flex h-full w-[400px] flex-col border-l border-[#afb3ac]/15 bg-[#fafaf5] shadow-[-12px_0_40px_rgba(47,52,46,0.06)]">
      <div className="flex items-center justify-between bg-[#f3f4ee] px-6 py-5">
        <div className="flex items-center gap-3">
          <MaterialIcon icon="list_alt" className="text-xl text-[#3a6095]" />
          <h2 className="font-['Manrope'] text-[16px] font-bold text-[#2f342e]">Execution Logs</h2>
          <span
            className={`rounded px-2 py-1 text-[9px] font-bold uppercase tracking-wider ${
              streamFailed ? 'bg-red-100 text-red-800' : 'bg-[#e0e4dc] text-[#2f342e]'
            }`}
          >
            {streamFailed ? 'Error' : 'Live'}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={runLocked}
          title={runLocked ? 'Wait for run to finish' : 'Close'}
          className="rounded-lg p-1.5 text-[#afb3ac] transition-colors hover:bg-[#edefe8] hover:text-[#2f342e] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <MaterialIcon icon="close" className="text-lg" />
        </button>
      </div>

      {runLocked && !streamFailed && (
        <p className="border-b border-[#afb3ac]/15 bg-[#fafaf5] px-6 py-2 text-[11px] font-semibold text-[#3a6095]">
          Run in progress — panel locked until completion.
        </p>
      )}

      {streamFailed && (
        <div className="border-b border-red-200 bg-red-50 px-6 py-4">
          <div className="flex items-start gap-2">
            <MaterialIcon icon="error" className="mt-0.5 shrink-0 text-lg text-red-700" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-red-900">Run stream failed</p>
              <p className="mt-1 text-[12px] leading-snug text-red-800">
                {streamError ??
                  'Could not open the WebSocket to this run. No live execution data was received.'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col">
          {nodes.map((node, i) => (
            <LiveTimelineItem key={node.id} node={node} isLast={i === nodes.length - 1} />
          ))}
        </div>
      </div>

      <div className="shrink-0 border-t border-[#afb3ac]/15 bg-[#f3f4ee] px-6 py-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#afb3ac]">Previous runs</span>
          {runHistory && runHistory.total >= 1 && (
            <button
              type="button"
              onClick={() => setHistoryPopupOpen(true)}
              className="text-[11px] font-bold text-[#3a6095] transition-colors hover:text-[#2c4c77]"
            >
              All runs ({runHistory.total})
            </button>
          )}
        </div>
        {historyLoading && <p className="text-[12px] text-[#2f342e]/60">Loading history…</p>}
        {!historyLoading && !workflowId && (
          <p className="text-[12px] text-[#2f342e]/60">Save the workflow to see run history.</p>
        )}
        {!historyLoading && workflowId && runHistory === null && (
          <p className="text-[12px] text-[#a83836]/90">Could not load run history. Try closing and reopening this panel.</p>
        )}
        {!historyLoading && workflowId && runHistory !== null && !latestRun && (
          <p className="text-[12px] text-[#2f342e]/60">No runs recorded for this workflow yet.</p>
        )}
        {!historyLoading && latestRun && latestSummary && (
          <div className="rounded-xl bg-[#fafaf5] px-3 py-2.5 text-[12px] text-[#2f342e] shadow-sm ring-1 ring-[#afb3ac]/10">
            <p className="font-semibold">
              Latest run · {runTimeLabel(latestRun)} · v{latestRun.workflowVersion.versionNumber}
            </p>
            <p className="mt-1 text-[11px] text-[#2f342e]/75">
              <span className="text-emerald-700">{latestSummary.success} succeeded</span>
              {' · '}
              <span className="text-red-700">{latestSummary.failed} failed</span>
              {' · '}
              {latestSummary.total} steps
            </p>
          </div>
        )}
      </div>

      {historyPopupOpen &&
        runHistory &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-stone-900/40 p-6 backdrop-blur-sm"
            role="dialog"
            aria-modal
            aria-label="Run history"
            onClick={() => setHistoryPopupOpen(false)}
          >
            <div
              className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#afb3ac]/20 bg-[#fafaf5] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-[#afb3ac]/15 px-5 py-4">
                <h3 className="font-['Manrope'] text-[16px] font-bold text-[#2f342e]">All runs</h3>
                <button
                  type="button"
                  onClick={() => setHistoryPopupOpen(false)}
                  className="rounded-lg p-1.5 text-[#afb3ac] hover:bg-[#edefe8]"
                  aria-label="Close"
                >
                  <MaterialIcon icon="close" className="text-lg" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <div className="flex flex-col gap-4">
                  {sortedRuns.map((run, idx) => (
                    <RunHistoryBlock
                      key={run.id}
                      run={run}
                      nodes={nodes}
                      title={`${idx === 0 ? 'Latest · ' : ''}${runTimeLabel(run)} · v${run.workflowVersion.versionNumber} · ${run.status}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
