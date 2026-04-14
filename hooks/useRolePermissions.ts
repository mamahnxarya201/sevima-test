'use client';

import { useEffect, useMemo, useState } from 'react';
import { authClient } from '@/lib/auth/auth-client';

type AppRole = 'ADMIN' | 'EDITOR' | 'VIEWER';

function normalizeRole(raw: unknown): AppRole {
  const value = String(raw ?? 'VIEWER').toUpperCase();
  if (value === 'ADMIN' || value === 'EDITOR' || value === 'VIEWER') {
    return value;
  }
  return 'VIEWER';
}

export function useRolePermissions() {
  const [role, setRole] = useState<AppRole>('VIEWER');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data } = await authClient.getSession();
        if (cancelled) return;
        const userRole =
          (data as { user?: { role?: unknown } } | null)?.user?.role ??
          (data as { session?: { user?: { role?: unknown } } } | null)?.session?.user?.role;
        setRole(normalizeRole(userRole));
      } catch {
        if (!cancelled) setRole('VIEWER');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(
    () => ({
      role,
      loading,
      canEdit: role === 'ADMIN' || role === 'EDITOR',
      isViewer: role === 'VIEWER',
    }),
    [role, loading]
  );
}
