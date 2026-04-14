/**
 * middleware.ts
 *
 * Protects all routes under the main app.
 * Unauthenticated requests are redirected to /login.
 * API routes return 401 JSON instead of redirecting.
 *
 * Public routes (no auth required):
 *   /login, /register, /api/auth/*, /api/tenants (registration)
 */
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/api/auth',
  '/api/tenants',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow WebSocket upgrade path (next-ws)
  if (pathname.startsWith('/api/ws')) {
    return NextResponse.next();
  }

  // Check for Better Auth session cookie
  const sessionToken =
    request.cookies.get('better-auth.session_token')?.value ??
    request.cookies.get('__Secure-better-auth.session_token')?.value;

  // Also accept Bearer token for API routes
  const authHeader = request.headers.get('authorization');
  const hasBearer = authHeader?.startsWith('Bearer ');

  if (!sessionToken && !hasBearer) {
    // API routes → 401 JSON
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // UI routes → redirect to login
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
