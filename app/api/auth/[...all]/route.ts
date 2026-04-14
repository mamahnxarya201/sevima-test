/**
 * app/api/auth/[...all]/route.ts
 *
 * Better Auth catch-all handler.
 * Exposes: /api/auth/sign-in, /api/auth/sign-up, /api/auth/token, /api/auth/jwks, etc.
 */
import { auth } from '@/lib/auth/auth';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return auth.handler(request);
}

export async function POST(request: NextRequest) {
  return auth.handler(request);
}
