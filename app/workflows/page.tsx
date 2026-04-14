'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSetAtom } from 'jotai';
import { AppShellSidebar } from '@/components/layout/AppShellSidebar';
import { NewWorkflowModal } from '@/components/workflows/NewWorkflowModal';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { authClient } from '@/lib/auth/auth-client';
import { tenantNameAtom, tenantIdAtom } from '@/store/workflowStore';
import { formatRelativeTime } from '@/lib/datetime/formatRelativeTime';
import { runWebSocketUrl, waitForWebSocketOpen } from '@/lib/socket/runWebSocketUrl';

const PAGE_SIZE = 20;

type RunSummary = {
  runCount: number;
  lastRunAt: string | null;
  lastRunStatus: string | null;
};

type WorkflowRow = {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
  _count?: { versions: number };
  runSummary?: RunSummary;
};

function workflowStatusPresentation(summary: RunSummary | undefined) {
  const runCount = summary?.runCount ?? 0;
  const st = summary?.lastRunStatus ?? null;
  if (runCount === 0 || !st) {
    return {
      label: 'Ready',
      dot: 'bg-[#afb3ac]',
      strip: 'bg-[#afb3ac]/35',
    };
  }
  if (st === 'SUCCESS') {
    return { label: 'Succeeded', dot: 'bg-emerald-500', strip: 'bg-emerald-500/40' };
  }
  if (st === 'FAILED') {
    return { label: 'Failed', dot: 'bg-[#a83836]', strip: 'bg-[#a83836]/35' };
  }
  if (st === 'RUNNING' || st === 'PENDING' || st === 'RETRYING') {
    return { label: 'Running', dot: 'bg-[#3a6095]', strip: 'bg-[#3a6095]/40' };
  }
  return { label: st, dot: 'bg-[#afb3ac]', strip: 'bg-[#afb3ac]/35' };
}

type ListResponse = {
  workflows?: WorkflowRow[];
  total?: number;
  limit?: number;
  offset?: number;
};

export default function WorkflowsPage() {
  const router = useRouter();
  const setTenantName = useSetAtom(tenantNameAtom);
  const setTenantId = useSetAtom(tenantIdAtom);
  const [items, setItems] = useState<WorkflowRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'updated' | 'name'>('updated');
  const [modalOpen, setModalOpen] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  /** Set while POST succeeded and we are connected to `/api/ws/runs/:runId` until `complete` (or error). */
  const [runningWorkflowId, setRunningWorkflowId] = useState<string | null>(null);
  const [runFeedback, setRunFeedback] = useState<{ id: string; ok: boolean; message: string } | null>(null);
  const runWsRef = useRef<WebSocket | null>(null);

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
      } catch {
        setTenantName('FlowForge');
      }
    }
    fetchTenantName();
  }, [setTenantName, setTenantId]);

  const load = useCallback(
    async (opts: { append: boolean; nextOffset: number }) => {
      setListError(null);
      if (opts.append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      try {
        const { data: tokenData } = await authClient.token();
        const token = tokenData?.token ?? '';
        if (!token) {
          setItems([]);
          setTotal(0);
          return;
        }
        const params = new URLSearchParams();
        if (search.trim()) params.set('search', search.trim());
        params.set('sort', sort);
        params.set('limit', String(PAGE_SIZE));
        params.set('offset', String(opts.nextOffset));
        const res = await fetch(`/api/workflows?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          setListError('Could not load workflows');
          setItems([]);
          setTotal(0);
          return;
        }
        const data: ListResponse = await res.json();
        const rows = data.workflows ?? [];
        const t = typeof data.total === 'number' ? data.total : rows.length;
        if (opts.append) {
          setItems((prev) => [...prev, ...rows]);
        } else {
          setItems(rows);
        }
        setTotal(t);
        setOffset(opts.nextOffset + rows.length);
      } catch {
        setListError('Could not load workflows');
        setItems([]);
        setTotal(0);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [search, sort]
  );

  useEffect(() => {
    setOffset(0);
    const t = setTimeout(() => void load({ append: false, nextOffset: 0 }), search ? 200 : 0);
    return () => clearTimeout(t);
  }, [load, search, sort]);

  const navItems = useMemo(
    () => [{ href: '/workflows', label: 'Workflows', icon: 'account_tree', active: true }],
    []
  );

  useEffect(() => {
    return () => {
      runWsRef.current?.close();
      runWsRef.current = null;
    };
  }, []);

  const triggerRun = useCallback(
    async (workflowId: string) => {
      setRunFeedback(null);
      runWsRef.current?.close();
      runWsRef.current = null;

      try {
        const { data: tokenData } = await authClient.token();
        const token = tokenData?.token ?? '';
        if (!token) {
          setRunFeedback({ id: workflowId, ok: false, message: 'Not signed in' });
          return;
        }

        const res = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}/run`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = (await res.json().catch(() => ({}))) as { runId?: string; error?: string };
        if (!res.ok || !body.runId) {
          setRunFeedback({
            id: workflowId,
            ok: false,
            message: typeof body.error === 'string' ? body.error : 'Could not start run',
          });
          window.setTimeout(() => setRunFeedback(null), 5000);
          return;
        }

        const runId = body.runId;
        setRunningWorkflowId(workflowId);

        // Realtime status: show Running while the run stream is active
        setItems((prev) =>
          prev.map((row) =>
            row.id === workflowId
              ? {
                  ...row,
                  runSummary: {
                    runCount: row.runSummary?.runCount ?? 0,
                    lastRunAt: new Date().toISOString(),
                    lastRunStatus: 'RUNNING',
                  },
                }
              : row
          )
        );

        const ws = new WebSocket(runWebSocketUrl(runId, token));
        runWsRef.current = ws;

        let settled = false;
        const settle = (ok: boolean, message: string) => {
          if (settled) return;
          settled = true;
          setRunningWorkflowId(null);
          runWsRef.current = null;
          try {
            ws.close();
          } catch {
            /* ignore */
          }
          setRunFeedback({ id: workflowId, ok, message });
          window.setTimeout(() => setRunFeedback(null), 4000);
          void load({ append: false, nextOffset: 0 });
        };

        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data as string) as {
              type?: string;
              status?: string;
              message?: string;
            };
            if (msg.type === 'error') {
              settle(false, typeof msg.message === 'string' ? msg.message : 'Run error');
              return;
            }
            if (msg.type === 'complete') {
              const ok = msg.status === 'SUCCESS';
              const lastSt = ok ? 'SUCCESS' : 'FAILED';
              setItems((prev) =>
                prev.map((row) =>
                  row.id === workflowId
                    ? {
                        ...row,
                        runSummary: {
                          runCount: (row.runSummary?.runCount ?? 0) + 1,
                          lastRunAt: new Date().toISOString(),
                          lastRunStatus: lastSt,
                        },
                      }
                    : row
                )
              );
              settle(ok, ok ? 'Finished' : 'Run failed');
            }
          } catch {
            /* ignore */
          }
        };

        ws.onerror = () => {
          settle(false, 'WebSocket error');
        };

        ws.onclose = (ev) => {
          if (settled) return;
          if (ev.code === 1008) {
            settle(false, ev.reason?.trim() || 'Unauthorized');
            return;
          }
          settle(false, 'Disconnected');
        };

        try {
          await waitForWebSocketOpen(ws);
        } catch {
          settle(false, 'Could not connect to run stream');
        }
      } catch {
        setRunFeedback({ id: workflowId, ok: false, message: 'Network error' });
        setRunningWorkflowId(null);
        window.setTimeout(() => setRunFeedback(null), 5000);
      }
    },
    [load]
  );

  const canLoadMore = items.length < total && !loading && !loadingMore;

  return (
    <div className="flex min-h-screen items-stretch bg-[#fafaf5] font-sans text-[#2f342e]">
      <link
        href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Inter:wght@400;500;600&display=swap"
        rel="stylesheet"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        rel="stylesheet"
      />

      <AppShellSidebar items={navItems} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 bg-[#fafaf5]/85 px-8 py-6 backdrop-blur-[20px]">
          <div>
            <h1 className="font-['Manrope'] text-2xl font-bold tracking-tight text-[#2f342e]">
              Workflows
            </h1>
            <p className="mt-1 max-w-xl text-[13px] text-[#afb3ac]">
              Open an automation to edit, or create a new one. Changes stay in your tenant.
            </p>
          </div>
        </header>

        <main className="flex-1 px-8 py-8">
          <div className="mx-auto max-w-5xl">
            <div className="mb-8 flex flex-col gap-4">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#3a6095] px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#2c4c77]"
                >
                  <MaterialIcon icon="add" className="text-[16px]" />
                  New workflow
                </button>
              </div>
              <div className="flex flex-wrap items-end gap-4">
                <div className="min-w-0 flex-1 sm:min-w-[200px]">
                  <label
                    htmlFor="wf-search"
                    className="mb-1.5 block text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-[#afb3ac]"
                  >
                    Search
                  </label>
                  <div className="relative">
                    <MaterialIcon
                      icon="search"
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#afb3ac]"
                    />
                    <input
                      id="wf-search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Filter by name or description"
                      className="w-full rounded-xl border-0 bg-white py-2.5 pl-10 pr-3 text-[13px] text-[#2f342e] shadow-inner outline-none ring-1 ring-[#afb3ac]/15 transition-shadow focus:ring-2 focus:ring-[#3a6095]"
                    />
                  </div>
                </div>
                <div className="shrink-0">
                  <label
                    htmlFor="wf-sort"
                    className="mb-1.5 block text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-[#afb3ac]"
                  >
                    Sort
                  </label>
                  <select
                    id="wf-sort"
                    value={sort}
                    onChange={(e) => setSort(e.target.value as 'updated' | 'name')}
                    className="rounded-xl border-0 bg-white py-2.5 pl-3 pr-8 text-[13px] font-medium text-[#2f342e] shadow-inner outline-none ring-1 ring-[#afb3ac]/15 transition-shadow focus:ring-2 focus:ring-[#3a6095]"
                  >
                    <option value="updated">Last updated</option>
                    <option value="name">Name (A–Z)</option>
                  </select>
                </div>
              </div>
            </div>

            {listError && (
              <p className="mb-4 rounded-lg bg-[#fa746f]/20 px-4 py-2 text-[13px] font-semibold text-[#a83836]">
                {listError}
              </p>
            )}

            {loading ? (
              <p className="text-[13px] font-medium text-[#afb3ac]">Loading workflows…</p>
            ) : items.length === 0 ? (
              <div className="rounded-[1.5rem] bg-[#edefe8] px-8 py-16">
                <p className="text-center font-['Manrope'] text-lg font-semibold text-[#2f342e]">
                  No workflows yet
                </p>
                <p className="mt-2 text-center text-[13px] text-[#afb3ac]">
                  Create one to get started — you&apos;ll draw the graph on the canvas next.
                </p>
                <div className="mt-10 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setModalOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#3a6095] px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#2c4c77]"
                  >
                    <MaterialIcon icon="add" className="text-[16px]" />
                    New workflow
                  </button>
                </div>
              </div>
            ) : (
              <>
                <ul className="space-y-3">
                  {items.map((w) => {
                    const rs = w.runSummary;
                    const pres = workflowStatusPresentation(rs);
                    const liveRunning = runningWorkflowId === w.id;
                    const lastRunLabel =
                      rs?.lastRunAt != null ? formatRelativeTime(rs.lastRunAt) : '—';
                    return (
                      <li key={w.id}>
                        <div className="flex overflow-hidden rounded-[1.25rem] bg-white shadow-[0_12px_40px_rgba(47,52,46,0.06)] transition-colors hover:bg-[#fafaf5]">
                          <div
                            className={`w-1.5 shrink-0 self-stretch rounded-l-[1.2rem] ${pres.strip}`}
                            aria-hidden
                          />
                          <Link
                            href={`/canvas?workflowId=${encodeURIComponent(w.id)}`}
                            className="group flex min-w-0 flex-1 flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5 sm:py-4 md:grid md:grid-cols-[minmax(0,1fr)_7.5rem_5.5rem_7.5rem] md:items-center md:gap-4"
                          >
                            <div className="flex min-w-0 items-start gap-3">
                              <div
                                className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3f4ee] text-[#3a6095]"
                                aria-hidden
                              >
                                <MaterialIcon icon="account_tree" className="text-[22px]" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-['Manrope'] text-[15px] font-bold leading-snug text-[#2f342e] group-hover:text-[#3a6095]">
                                  {w.name}
                                </p>
                                {w.description ? (
                                  <p className="mt-0.5 line-clamp-2 text-[13px] text-[#afb3ac]">{w.description}</p>
                                ) : (
                                  <p className="mt-0.5 text-[12px] text-[#afb3ac]">
                                    {w._count != null
                                      ? `${w._count.versions} version${w._count.versions === 1 ? '' : 's'}`
                                      : '\u00a0'}
                                  </p>
                                )}
                                <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 md:hidden">
                                  <div>
                                    <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-[#afb3ac]">
                                      Status
                                    </dt>
                                    <dd className="mt-0.5 flex items-center gap-1.5 text-[13px] font-medium text-[#2f342e]">
                                      <span
                                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${pres.dot} ${liveRunning ? 'animate-pulse' : ''}`}
                                      />
                                      {pres.label}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-[#afb3ac]">
                                      Runs
                                    </dt>
                                    <dd className="mt-0.5 text-[13px] font-semibold text-[#2f342e]">
                                      {rs?.runCount ?? 0}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-[#afb3ac]">
                                      Last run
                                    </dt>
                                    <dd className="mt-0.5 text-[13px] font-medium text-[#2f342e]/90">
                                      {lastRunLabel}
                                    </dd>
                                  </div>
                                </dl>
                              </div>
                            </div>
                            <div className="hidden text-center md:block">
                              <span className="block text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-[#afb3ac]">
                                Status
                              </span>
                              <span className="mt-1 inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold text-[#2f342e]">
                                <span
                                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${pres.dot} ${liveRunning ? 'animate-pulse' : ''}`}
                                />
                                {pres.label}
                              </span>
                            </div>
                            <div className="hidden text-center md:block">
                              <span className="block text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-[#afb3ac]">
                                Runs
                              </span>
                              <span className="mt-1 block text-[13px] font-semibold text-[#2f342e]">
                                {rs?.runCount ?? 0}
                              </span>
                            </div>
                            <div className="hidden text-center md:block">
                              <span className="block text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-[#afb3ac]">
                                Last run
                              </span>
                              <span className="mt-1 block text-[13px] font-medium text-[#2f342e]/90">
                                {lastRunLabel}
                              </span>
                            </div>
                          </Link>
                          <div className="flex shrink-0 flex-col items-center justify-center bg-[#f3f4ee]/50 px-2 py-3 sm:px-3">
                            <button
                              type="button"
                              title="Run workflow"
                              disabled={runningWorkflowId === w.id}
                              onClick={(e) => {
                                e.preventDefault();
                                void triggerRun(w.id);
                              }}
                              className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white text-[#3a6095] shadow-[0_2px_8px_rgba(47,52,46,0.04)] ring-1 ring-[#afb3ac]/15 transition-colors hover:bg-[#edefe8] hover:ring-[#3a6095]/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3a6095] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <MaterialIcon
                                icon={runningWorkflowId === w.id ? 'sync' : 'play_arrow'}
                                className={`text-[26px] ${runningWorkflowId === w.id ? 'animate-spin' : ''}`}
                              />
                            </button>
                            {runFeedback?.id === w.id && (
                              <span
                                className={`mt-1 max-w-[5.5rem] text-center text-[10px] font-semibold leading-tight ${
                                  runFeedback.ok ? 'text-emerald-600' : 'text-[#a83836]'
                                }`}
                              >
                                {runFeedback.message}
                              </span>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {canLoadMore && (
                  <div className="mt-8 flex justify-center">
                    <button
                      type="button"
                      disabled={loadingMore}
                      onClick={() => void load({ append: true, nextOffset: offset })}
                      className="rounded-xl bg-[#edefe8] px-5 py-2.5 text-[13px] font-semibold text-[#2f342e] ring-1 ring-[#afb3ac]/15 transition-colors hover:bg-[#e0e4dc] disabled:opacity-60"
                    >
                      {loadingMore ? 'Loading…' : 'Load more'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      <NewWorkflowModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(id) => {
          router.push(`/canvas?workflowId=${encodeURIComponent(id)}`);
        }}
      />
    </div>
  );
}
