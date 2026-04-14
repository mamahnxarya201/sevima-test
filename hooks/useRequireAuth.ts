'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { authClient } from '@/lib/auth/auth-client';

/**
 * Validates the session on mount and redirects to /login if the user is not
 * authenticated.  Returns `true` once the session has been confirmed so the
 * page can gate rendering on it (avoids flash of protected content).
 *
 * Usage (in any protected client page):
 *   const ready = useRequireAuth();
 *   if (!ready) return <LoadingSpinner />;
 */
export function useRequireAuth(): boolean {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data } = await authClient.getSession();
        if (cancelled) return;

        if (!data?.session) {
          const target = `/login?from=${encodeURIComponent(pathname)}`;
          router.replace(target);
          return;
        }

        setReady(true);
      } catch {
        if (!cancelled) {
          router.replace(`/login?from=${encodeURIComponent(pathname)}`);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, pathname]);

  return ready;
}

/**
 * For auth pages (login/register): redirects to /workflows if already
 * authenticated.  Returns `true` once it's confirmed the user is NOT
 * authenticated (safe to show the form).
 */
export function useRedirectIfAuthenticated(): boolean {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data } = await authClient.getSession();
        if (cancelled) return;

        if (data?.session) {
          router.replace('/workflows');
          return;
        }

        setReady(true);
      } catch {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return ready;
}
