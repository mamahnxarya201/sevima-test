'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSetAtom } from 'jotai';
import { AppShellPage } from '@/components/layout/AppShellPage';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { authClient } from '@/lib/auth/auth-client';
import { tenantNameAtom, tenantIdAtom } from '@/store/workflowStore';

function decodeTenantId(token: string): string {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.tenantId ?? '';
  } catch {
    return '';
  }
}

function buildGrafanaIframeUrl(token: string): string {
  const raw = process.env.NEXT_PUBLIC_GRAFANA_DASHBOARD_PATH
    ?? '/d/flowforge-global-health/flowforge-global-health';
  const base = (process.env.NEXT_PUBLIC_GRAFANA_URL ?? 'http://localhost:3001').replace(/\/+$/, '');

  const pathOnly = raw.split('?')[0];
  const path = pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;

  const tenantId = decodeTenantId(token);

  return `${base}${path}?orgId=1&kiosk&theme=light&var-tenant_id=${encodeURIComponent(tenantId)}&auth_token=${encodeURIComponent(token)}`;
}

export default function GrafanaPage() {
  const authed = useRequireAuth();
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const setTenantName = useSetAtom(tenantNameAtom);
  const setTenantId = useSetAtom(tenantIdAtom);

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;

    (async () => {
      try {
        const { data: tokenData } = await authClient.token();
        if (cancelled) return;
        const token = tokenData?.token ?? '';
        if (!token) {
          setError('No JWT token. Please sign in again.');
          return;
        }

        setIframeUrl(buildGrafanaIframeUrl(token));

        const res = await fetch('/api/tenants', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        const data = await res.json();
        if (data.tenant?.name) setTenantName(data.tenant.name);
        if (data.tenant?.id) setTenantId(data.tenant.id);
      } catch {
        if (!cancelled) setError('Could not load Grafana dashboard.');
      }
    })();

    return () => { cancelled = true; };
  }, [authed, attempt, setTenantName, setTenantId]);

  const navItems = useMemo(
    () => [
      { href: '/workflows', label: 'Workflows', icon: 'account_tree', active: false },
      { href: '/execution-logs', label: 'Execution Logs', icon: 'list_alt', active: false },
      { href: '/grafana', label: 'Monitoring', icon: 'monitoring', active: true },
    ],
    [],
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
      title="Monitoring"
      description="Live workflow health — powered by Grafana."
      mainClassName="h-screen overflow-hidden"
      contentClassName="!p-0 flex-1 min-h-0"
    >
      {error ? (
        <div className="flex h-full items-center justify-center px-8">
          <div className="w-full max-w-md rounded-[1.5rem] bg-[#edefe8] p-8 text-center">
            <p className="font-['Manrope'] text-lg font-bold text-[#2f342e]">{error}</p>
            <button
              type="button"
              onClick={() => { setError(null); setAttempt((n) => n + 1); }}
              className="mt-4 rounded-xl bg-[#3a6095] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2c4c77]"
            >
              Retry
            </button>
          </div>
        </div>
      ) : !iframeUrl ? (
        <div className="flex h-full items-center justify-center">
          <p className="font-['Manrope'] text-[13px] font-semibold text-[#afb3ac]">Loading dashboard…</p>
        </div>
      ) : (
        <iframe
          src={iframeUrl}
          className="h-full w-full border-0"
          allow="fullscreen"
          title="FlowForge Monitoring"
        />
      )}
    </AppShellPage>
  );
}
