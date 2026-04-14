'use client';

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { AppShellPage } from '@/components/layout/AppShellPage';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { ListQueryControls } from '@/components/ui/ListQueryControls';
import { ListPagination } from '@/components/ui/ListPagination';
import { authClient } from '@/lib/auth/auth-client';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { formatRelativeTime } from '@/lib/datetime/formatRelativeTime';
import { nodeHeaderTitle } from '@/lib/canvas/nodePresentation';
import { executionLogsWebSocketUrl } from '@/lib/socket/runWebSocketUrl';
import { fetchExecutionLogs, type ExecutionLogStepSnapshot } from '@/lib/workflow/fetchExecutionLogs';
import { fetchWorkflowAtVersion } from '@/lib/workflow/fetchWorkflowMeta';
import { parseEditorState } from '@/lib/canvas/editorState';
import {
  executionLogsApplyStepAtom,
  executionLogsErrorAtom,
  executionLogsExpandedRunIdsAtom,
  executionLogsSearchAtom,
  executionLogsSortAtom,
  executionLogsPageAtom,
  executionLogsLimitAtom,
  executionLogsLoadingAtom,
  executionLogsRunAtomFamily,
  executionLogsRunIdsAtom,
  executionLogsReplaceRunsAtom,
  executionLogsRuntimeCountAtom,
  executionLogsStreamErrorAtom,
  executionLogsStreamStatusAtom,
  executionLogsTotalAtom,
  executionLogsUpsertRunAtom,
} from '@/store/executionLogsStore';
import { tenantIdAtom, tenantNameAtom } from '@/store/workflowStore';

function nodeDescriptionsByIdFromEditorState(editorState: unknown): Record<string, string> {
  const parsed = parseEditorState(editorState);
  if (!parsed) return {};
  const out: Record<string, string> = {};
  for (const node of parsed.nodes) {
    const data = (node.data ?? {}) as { description?: unknown };
    if (typeof data.description === 'string' && data.description.trim() !== '') {
      out[node.id] = data.description.trim();
    }
  }
  return out;
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function statusPill(status: string) {
  if (status === 'SUCCESS') return 'bg-emerald-100 text-emerald-700';
  if (status === 'FAILED' || status === 'TIMEOUT') return 'bg-red-100 text-red-700';
  if (status === 'RUNNING' || status === 'RETRYING' || status === 'PENDING') return 'bg-[#9ec2fe]/30 text-[#2c4c77]';
  return 'bg-[#edefe8] text-[#2f342e]/70';
}

function stepSummary(stepRuns: ExecutionLogStepSnapshot[]) {
  let ok = 0;
  let failed = 0;
  for (const step of stepRuns) {
    if (step.status === 'SUCCESS') ok++;
    if (step.status === 'FAILED' || step.status === 'TIMEOUT') failed++;
  }
  return { ok, failed, total: stepRuns.length };
}

function StepTimelineRow({
  step,
  isLast,
  nodeType,
  nodeDescription,
}: {
  step: ExecutionLogStepSnapshot;
  isLast: boolean;
  nodeType?: string;
  nodeDescription?: string;
}) {
  const tone =
    step.status === 'SUCCESS'
      ? 'bg-emerald-500'
      : step.status === 'FAILED' || step.status === 'TIMEOUT'
        ? 'bg-[#a83836]'
        : step.status === 'RUNNING' || step.status === 'RETRYING'
          ? 'bg-[#3a6095]'
          : 'bg-[#afb3ac]';

  return (
    <div className="relative pb-6 pl-8">
      {!isLast && <div className="absolute bottom-0 left-[11px] top-4 w-[2px] rounded-full bg-[#edefe8]" />}
      <div className={`absolute left-[7px] top-1.5 h-2.5 w-2.5 rounded-full ${tone}`} />
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#afb3ac]">
              {nodeHeaderTitle(nodeType ?? step.stepId)}
            </p>
            <p className="text-[11px] font-semibold text-[#2f342e]">
              {nodeDescription ?? step.stepId}
            </p>
          </div>
          <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${statusPill(step.status)}`}>{step.status}</span>
        </div>
        {step.logs ? <p className="line-clamp-2 text-[12px] text-[#2f342e]/70">{step.logs}</p> : null}
        {step.errorMessage ? <p className="text-[12px] font-semibold text-[#a83836]">{step.errorMessage}</p> : null}
      </div>
    </div>
  );
}

function ExecutionRunAccordion({
  runId,
  expanded,
  onToggle,
}: {
  runId: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const run = useAtomValue(executionLogsRunAtomFamily(runId));
  const upsertRun = useSetAtom(executionLogsUpsertRunAtom);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (!expanded || !run) return;
    if (hydratedRef.current) return;
    if (run.stepRuns.length === 0) return;
    if (Object.keys(run.workflowVersion.nodeDescriptionsById ?? {}).length > 0) return;

    hydratedRef.current = true;
    let cancelled = false;

    void (async () => {
      const { data: tokenData } = await authClient.token();
      const token = tokenData?.token ?? '';
      if (!token || cancelled) return;

      const meta = await fetchWorkflowAtVersion(
        run.workflowVersion.workflowId,
        run.workflowVersion.versionNumber,
        token
      );
      if (!meta || cancelled) return;
      const editorState = meta.workflow.versions?.[0]?.editorState;
      const mapped = nodeDescriptionsByIdFromEditorState(editorState);
      if (Object.keys(mapped).length === 0 || cancelled) return;

      upsertRun({
        id: run.id,
        status: run.status,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        duration: run.duration,
        triggeredByLabel: run.triggeredByLabel,
        workflowVersion: {
          ...run.workflowVersion,
          nodeDescriptionsById: {
            ...(run.workflowVersion.nodeDescriptionsById ?? {}),
            ...mapped,
          },
        },
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [expanded, run, upsertRun]);

  if (!run) return null;

  const summary = stepSummary(run.stepRuns);
  const runTime = run.endedAt ?? run.startedAt;

  return (
    <article className="overflow-hidden rounded-[1.25rem] border border-[#afb3ac]/20 bg-white shadow-[0_10px_35px_rgba(47,52,46,0.04)]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left transition-colors hover:bg-[#fafaf5]"
      >
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusPill(run.status)}`}>
              {run.status}
            </span>
            <span className="text-[12px] font-semibold text-[#2f342e]/75">
              {run.workflowVersion.workflow.name} · v{run.workflowVersion.versionNumber}
            </span>
          </div>
          <p className="text-[12px] text-[#2f342e]/70">
            Triggered By: <span className="font-semibold text-[#2f342e]/85">{run.triggeredByLabel}</span>
          </p>
          <p className="mt-1 text-[12px] text-[#2f342e]/70">
            {summary.ok} ok · {summary.failed} failed · {summary.total} steps · {formatDuration(run.duration)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[12px] font-semibold text-[#2f342e]/85">{runTime ? formatRelativeTime(runTime) : '—'}</p>
          <MaterialIcon icon={expanded ? 'expand_less' : 'expand_more'} className="ml-auto mt-2 text-[#afb3ac]" />
        </div>
      </button>
      {expanded ? (
        <div className="border-t border-[#afb3ac]/15 bg-[#fafaf5] px-4 py-4">
          {run.stepRuns.length === 0 ? (
            <p className="text-[12px] text-[#2f342e]/60">Waiting for step events...</p>
          ) : (
            <div className="flex flex-col">
              {run.stepRuns.map((step, idx) => (
                <StepTimelineRow
                  key={`${run.id}-${step.stepId}`}
                  step={step}
                  nodeType={run.workflowVersion.nodeTypesById?.[step.stepId]}
                  nodeDescription={run.workflowVersion.nodeDescriptionsById?.[step.stepId]}
                  isLast={idx === run.stepRuns.length - 1}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </article>
  );
}

export default function ExecutionLogsPage() {
  const authed = useRequireAuth();
  const setTenantName = useSetAtom(tenantNameAtom);
  const setTenantId = useSetAtom(tenantIdAtom);

  const runIds = useAtomValue(executionLogsRunIdsAtom);
  const [total, setTotal] = useAtom(executionLogsTotalAtom);
  const [limit, setLimit] = useAtom(executionLogsLimitAtom);
  const [search, setSearch] = useAtom(executionLogsSearchAtom);
  const [sort, setSort] = useAtom(executionLogsSortAtom);
  const [page, setPage] = useAtom(executionLogsPageAtom);
  const [loading, setLoading] = useAtom(executionLogsLoadingAtom);
  const [error, setError] = useAtom(executionLogsErrorAtom);
  const runtimeCount = useAtomValue(executionLogsRuntimeCountAtom);
  const [streamStatus, setStreamStatus] = useAtom(executionLogsStreamStatusAtom);
  const [streamError, setStreamError] = useAtom(executionLogsStreamErrorAtom);
  const [expanded, setExpanded] = useAtom(executionLogsExpandedRunIdsAtom);

  const replaceRuns = useSetAtom(executionLogsReplaceRunsAtom);
  const upsertRun = useSetAtom(executionLogsUpsertRunAtom);
  const applyStep = useSetAtom(executionLogsApplyStepAtom);

  const load = useCallback(
    async (nextPage: number) => {
      setError(null);
      setLoading(true);

      try {
        const { data: tokenData } = await authClient.token();
        const token = tokenData?.token ?? '';
        if (!token) {
          replaceRuns([]);
          setTotal(0);
          return;
        }
        const data = await fetchExecutionLogs(token, {
          limit,
          offset: (nextPage - 1) * limit,
          search,
          sort,
        });
        if (!data) {
          setError('Could not load execution logs');
          return;
        }
        replaceRuns(data.runs);
        setTotal(data.total);
        setLimit(data.limit);
      } catch {
        setError('Could not load execution logs');
      } finally {
        setLoading(false);
      }
    },
    [setError, setLimit, setLoading, setTotal, replaceRuns, limit, search, sort]
  );

  useEffect(() => {
    async function fetchTenantMeta() {
      try {
        const { data: tokenData } = await authClient.token();
        const token = tokenData?.token;
        if (!token) {
          setTenantName('FlowForge');
          return;
        }
        const res = await fetch('/api/tenants', { headers: { Authorization: `Bearer ${token}` } });
        const data = (await res.json()) as { tenant?: { id?: string; name?: string } };
        if (data.tenant?.name) setTenantName(data.tenant.name);
        if (data.tenant?.id) setTenantId(data.tenant.id);
      } catch {
        setTenantName('FlowForge');
      }
    }
    void fetchTenantMeta();
  }, [setTenantId, setTenantName]);

  useEffect(() => {
    const t = setTimeout(() => void load(page), search ? 200 : 0);
    return () => clearTimeout(t);
  }, [load, page, search, sort]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closedByCleanup = false;

    async function connect() {
      try {
        setStreamError(null);
        setStreamStatus('connecting');
        const { data: tokenData } = await authClient.token();
        const token = tokenData?.token ?? '';
        if (!token) {
          setStreamStatus('error');
          setStreamError('Not signed in');
          return;
        }

        ws = new WebSocket(executionLogsWebSocketUrl(token));

        ws.onopen = () => setStreamStatus('open');
        ws.onerror = () => {
          setStreamStatus('error');
          setStreamError('Execution logs WebSocket error');
        };
        ws.onclose = () => {
          setStreamStatus(closedByCleanup ? 'closed' : 'error');
          if (!closedByCleanup) setStreamError('Execution logs WebSocket disconnected');
        };
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string) as
              | {
                  type: 'running_snapshot';
                  runs: Array<{
                    id: string;
                    status: string;
                    startedAt: string | null;
                    endedAt: string | null;
                    duration: number | null;
                    triggeredByLabel: string;
                    workflowVersion: {
                      workflowId: string;
                      versionNumber: number;
                      workflow: { name: string };
                      nodeTypesById: Record<string, string>;
                      nodeDescriptionsById: Record<string, string>;
                    };
                  }>;
                }
              | {
                  type: 'run_upsert';
                  run: {
                    id: string;
                    status: string;
                    startedAt: string | null;
                    endedAt: string | null;
                    duration: number | null;
                    triggeredByLabel: string;
                    workflowVersion: {
                      workflowId: string;
                      versionNumber: number;
                      workflow: { name: string };
                      nodeTypesById: Record<string, string>;
                      nodeDescriptionsById: Record<string, string>;
                    };
                  };
                }
              | {
                  type: 'step';
                  runId: string;
                  stepId: string;
                  status: string;
                  logs?: string;
                  error?: string;
                  outputs?: unknown;
                }
              | { type: 'error'; message?: string };

            if (msg.type === 'error') {
              setStreamStatus('error');
              setStreamError(msg.message ?? 'Execution logs stream error');
              return;
            }

            if (msg.type === 'running_snapshot') {
              for (const run of msg.runs) upsertRun(run);
              return;
            }
            if (msg.type === 'run_upsert') {
              upsertRun(msg.run);
              return;
            }
            if (msg.type === 'step') {
              applyStep(msg);
            }
          } catch {
            /* ignore malformed messages */
          }
        };
      } catch {
        setStreamStatus('error');
        setStreamError('Could not connect to execution logs stream');
      }
    }

    void connect();

    return () => {
      closedByCleanup = true;
      if (ws) ws.close();
    };
  }, [applyStep, setStreamError, setStreamStatus, upsertRun]);

  const navItems = useMemo(
    () => [
      { href: '/workflows', label: 'Workflows', icon: 'account_tree', active: false },
      {
        href: '/execution-logs',
        label: 'Execution Logs',
        icon: 'list_alt',
        active: true,
        badge: runtimeCount,
      },
      { href: '/grafana', label: 'Monitoring', icon: 'monitoring', active: false },
    ],
    [runtimeCount]
  );

  if (!authed) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#fafaf5] font-['Manrope'] text-[13px] font-semibold text-[#afb3ac]">
        Authenticating…
      </div>
    );
  }

  return (
    <AppShellPage
      sidebarItems={navItems}
      title="Execution Logs"
      description="Live run results from all workflows. Expand each run to inspect timeline details."
      headerRight={
        <div className="flex flex-wrap justify-end gap-3">
          <div className="rounded-xl bg-[#edefe8] px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#afb3ac]">Runtime</p>
            <p className="text-[20px] font-bold text-[#2f342e]">{runtimeCount}</p>
          </div>
          <div className="rounded-xl bg-[#edefe8] px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#afb3ac]">Total Runs</p>
            <p className="text-[20px] font-bold text-[#2f342e]">{total}</p>
          </div>
          <div className="rounded-xl bg-[#edefe8] px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#afb3ac]">Stream</p>
            <p className="text-[14px] font-bold text-[#2f342e]">{streamStatus}</p>
          </div>
        </div>
      }
    >
      <div className="mx-auto max-w-5xl space-y-4">
        {error ? <p className="rounded-lg bg-[#fa746f]/20 px-4 py-2 text-[13px] font-semibold text-[#a83836]">{error}</p> : null}
        {streamError ? (
          <p className="rounded-lg bg-red-50 px-4 py-2 text-[12px] font-semibold text-red-700">{streamError}</p>
        ) : null}

        <ListQueryControls
          searchPlaceholder="Filter by run id or workflow name"
          searchValue={search}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          sortValue={sort}
          sortOptions={[
            { value: 'newest', label: 'Newest first' },
            { value: 'oldest', label: 'Oldest first' },
          ]}
          onSortChange={(value) => {
            setSort(value as 'newest' | 'oldest');
            setPage(1);
          }}
        />

        {loading ? (
          <p className="text-[13px] font-medium text-[#afb3ac]">Loading execution logs...</p>
        ) : runIds.length === 0 ? (
          <div className="rounded-[1.5rem] bg-[#edefe8] px-8 py-16">
            <p className="text-center font-['Manrope'] text-lg font-semibold text-[#2f342e]">No runs recorded yet</p>
            <p className="mt-2 text-center text-[13px] text-[#afb3ac]">Start a workflow run to see live execution logs here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {runIds.map((runId) => (
              <ExecutionRunAccordion
                key={runId}
                runId={runId}
                expanded={Boolean(expanded[runId])}
                onToggle={() =>
                  setExpanded((prev) => ({
                    ...prev,
                    [runId]: !prev[runId],
                  }))
                }
              />
            ))}
          </div>
        )}

        <ListPagination
          page={page}
          pageSize={limit}
          total={total}
          onPageChange={(nextPage) => setPage(nextPage)}
        />
      </div>
    </AppShellPage>
  );
}
