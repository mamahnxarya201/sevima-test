/**
 * lib/auth/tenantGuard.ts
 *
 * Extracts tenant context from a Next.js request.
 * Reads the Authorization: Bearer <jwt> header, verifies via Better Auth's
 * JWKS endpoint, then fetches the tenant's connectionUrl from management DB
 * and returns a scoped Prisma client for that tenant.
 */

import { jwtVerify, createRemoteJWKSet } from 'jose';
import { managementDb } from '../prisma/management';
import { getTenantDb } from '../prisma/tenant';
import type { NextRequest } from 'next/server';
import type { PrismaClient } from '../generated/tenant-client';

const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
const JWKS = createRemoteJWKSet(new URL(`${BETTER_AUTH_URL}/api/auth/jwks`));

export interface TenantContext {
  userId: string;
  tenantId: string;
  role: string;
  tenantDb: PrismaClient;
}

export class AuthError extends Error {
  constructor(message: string, public status: number = 401) {
    super(message);
    this.name = 'AuthError';
  }
}

export async function resolveTenantContext(request: NextRequest): Promise<TenantContext> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError('Missing Authorization: Bearer <token> header', 401);
  }

  const token = authHeader.slice(7);

  let payload: Record<string, unknown>;
  try {
    const { payload: p } = await jwtVerify(token, JWKS, {
      issuer: BETTER_AUTH_URL,
      audience: BETTER_AUTH_URL,
    });
    console.log('p', p);
    payload = p as Record<string, unknown>;
  } catch (err) {
    throw new AuthError('Invalid or expired JWT: ' + err, 401);
  }

  const userId = payload['id'] as string;
  const tenantId = payload['tenantId'] as string;
  const role = (payload['role'] as string) ?? 'VIEWER';

  if (!tenantId) {
    throw new AuthError('JWT missing tenantId claim', 403);
  }

  // Fetch tenant connection URL from management DB
  const tenant = await managementDb.tenant.findUnique({
    where: { id: tenantId },
    select: { connectionUrl: true, status: true },
  });

  if (!tenant) {
    throw new AuthError('Tenant not found', 404);
  }

  if (tenant.status !== 'ACTIVE') {
    throw new AuthError('Tenant is inactive', 403);
  }

  const tenantDb = getTenantDb(tenant.connectionUrl);

  return { userId, tenantId, role, tenantDb };
}

/** Helper to return a standard 401/403 Response from a caught AuthError */
export function authErrorResponse(err: unknown): Response {
  if (err instanceof AuthError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  console.error('[authErrorResponse] Unexpected error (not AuthError):', err);
  const details =
    process.env.NODE_ENV === 'development' && err instanceof Error
      ? { details: err.message }
      : {};
  return Response.json({ error: 'Internal server error', ...details }, { status: 500 });
}
