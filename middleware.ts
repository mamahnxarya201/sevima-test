/**
 * middleware.ts
 *
 * Protects all routes under the main app.
 * Unauthenticated requests are redirected to /login.
 * API routes return 401 JSON instead of redirecting.
 *
 * Public routes (no auth required):
 *   /login, /register               — auth UI
 *   /api/auth/*                      — Better Auth endpoints
 *   POST /api/tenants                — tenant registration only
 *   /api/ws/*                        — WS upgrade (handler-level JWT auth)
 */
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PREFIXES = ['/login', '/register', '/api/auth', '/api/metrics'];

function isPublicRoute(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return true;

  // Only POST /api/tenants is public (registration); GET is authenticated
  if (pathname === '/api/tenants' && request.method === 'POST') return true;

  // WS upgrades are authenticated at handler level (JWT via ?token=)
  if (pathname.startsWith('/api/ws')) return true;

  return false;
}

export function middleware(request: NextRequest) {
  if (isPublicRoute(request)) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Check for Better Auth session cookie
  const sessionToken =
    request.cookies.get('better-auth.session_token')?.value ??
    request.cookies.get('__Secure-better-auth.session_token')?.value;

  // Also accept Bearer token for API routes
  const authHeader = request.headers.get('authorization');
  const hasBearer = authHeader?.startsWith('Bearer ');

  if (!sessionToken && !hasBearer) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all routes except static files and Next.js internals
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|gif|webp)).*)',
  ],
};
