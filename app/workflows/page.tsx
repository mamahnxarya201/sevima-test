'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSetAtom } from 'jotai';
import { AppShellSidebar } from '@/components/layout/AppShellSidebar';
import { NewWorkflowModal } from '@/components/workflows/NewWorkflowModal';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { authClient } from '@/lib/auth/auth-client';
import { tenantNameAtom } from '@/store/workflowStore';

type WorkflowRow = {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
  _count?: { versions: number };
};

export default function WorkflowsPage() {
  const router = useRouter();
  const setTenantName = useSetAtom(tenantNameAtom);
  const [items, setItems] = useState<WorkflowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'updated' | 'name'>('updated');
  const [modalOpen, setModalOpen] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

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
      } catch {
        setTenantName('FlowForge');
      }
    }
    fetchTenantName();
  }, [setTenantName]);

  const load = useCallback(async () => {
    setListError(null);
    setLoading(true);
    try {
      const { data: tokenData } = await authClient.token();
      const token = tokenData?.token ?? '';
      if (!token) {
        setItems([]);
        setLoading(false);
        return;
      }
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      params.set('sort', sort);
      const res = await fetch(`/api/workflows?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setListError('Could not load workflows');
        setItems([]);
        return;
      }
      const data = await res.json();
      setItems(data.workflows ?? []);
    } catch {
      setListError('Could not load workflows');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [search, sort]);

  useEffect(() => {
    const t = setTimeout(() => void load(), search ? 200 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const navItems = useMemo(
    () => [{ href: '/workflows', label: 'Workflows', icon: 'account_tree', active: true }],
    []
  );

  function formatUpdated(iso: string) {
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return iso;
    }
  }

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
              <ul className="space-y-4">
                {items.map((w) => (
                  <li key={w.id}>
                    <Link
                      href={`/canvas?workflowId=${encodeURIComponent(w.id)}`}
                      className="group flex flex-col gap-1 rounded-[1.25rem] bg-white px-6 py-5 shadow-[0_12px_40px_rgba(47,52,46,0.06)] transition-transform hover:scale-[1.01] sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-['Manrope'] text-[16px] font-bold text-[#2f342e] group-hover:text-[#3a6095]">
                          {w.name}
                        </p>
                        {w.description && (
                          <p className="mt-1 line-clamp-2 text-[13px] text-[#afb3ac]">{w.description}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
                        <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-[#afb3ac]">
                          Updated
                        </span>
                        <span className="text-[13px] font-medium text-[#2f342e]/80">
                          {formatUpdated(w.updatedAt)}
                        </span>
                        {w._count != null && (
                          <span className="text-[12px] text-[#afb3ac]">
                            {w._count.versions} version{w._count.versions === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
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
