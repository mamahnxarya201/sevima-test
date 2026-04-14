/**
 * app/api/tenants/route.ts
 *
 * POST /api/tenants — Register a new tenant
 *
 * This creates:
 *   1. A new Postgres database for the tenant (via superuser connection)
 *   2. A dedicated Postgres user with full access to that DB
 *   3. A Tenant record in the management DB
 *   4. A User (ADMIN) record in the management DB linked to the tenant
 *
 * Runs prisma migrate deploy against the new tenant DB via child_process.
 */
import { NextRequest } from 'next/server';
import { managementDb } from '@/lib/prisma/management';
import { resolveTenantContext, apiErrorResponse } from '@/lib/auth/tenantGuard';
import { readJsonBody } from '@/lib/api/jsonBody';
import { registerTenantBodySchema } from '@/lib/api/schemas/tenantRegister';
import { getClientIp } from '@/lib/api/clientIp';
import { enforceRateLimit, rateLimitConfig } from '@/lib/rateLimit/memory';
import crypto from 'crypto';
import pg from 'pg';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';

const { Client } = pg;

export async function GET(request: NextRequest) {
  try {
    const ctx = await resolveTenantContext(request);
    const cfg = rateLimitConfig();
    enforceRateLimit(`tenants:get:${ctx.userId}`, cfg.max, cfg.windowMs);

    const tenant = await managementDb.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { id: true, name: true, status: true, createdAt: true },
    });

    if (!tenant) {
      return Response.json({ error: 'Tenant not found' }, { status: 404 });
    }

    return Response.json({ tenant });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

function sanitizeIdentifier(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40);
}

export async function POST(request: NextRequest) {
  try {
    const cfg = rateLimitConfig();
    const ip = getClientIp(request);
    enforceRateLimit(`tenants:register:${ip}`, cfg.tenantRegisterMax, cfg.tenantRegisterWindowMs);

    const raw = await readJsonBody(request);
    const body = registerTenantBodySchema.parse(raw);

    const tenantId = crypto.randomUUID();
    const safeName = sanitizeIdentifier(body.tenantName);
    const dbName = `tenant_${safeName}_${tenantId.split('-')[0]}`;
    const dbUser = `${dbName}_user`;
    const dbPassword = crypto.randomBytes(24).toString('hex');

    const superuserUrl = process.env.DATABASE_URL!;
    const client = new Client({ connectionString: superuserUrl });
    await client.connect();

    try {
      await client.query(`CREATE USER "${dbUser}" WITH PASSWORD '${dbPassword}'`);
      await client.query(`CREATE DATABASE "${dbName}" OWNER "${dbUser}"`);
      await client.query(`GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${dbUser}"`);
    } finally {
      await client.end();
    }

    const urlParts = new URL(superuserUrl.includes('@') ? superuserUrl : `postgresql://x@${superuserUrl}`);
    const host = urlParts.hostname;
    const port = urlParts.port || '5432';
    const connectionUrl = `postgresql://${dbUser}:${dbPassword}@${host}:${port}/${dbName}`;

    try {
      execSync('npx prisma migrate deploy --schema prisma/tenant/schema.prisma', {
        stdio: 'pipe',
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: connectionUrl,
          TENANT_DATABASE_URL: connectionUrl,
        },
      });
    } catch (migrateErr) {
      console.error('[tenants] Migration failed:', migrateErr);
      return Response.json({ error: 'Tenant DB migration failed' }, { status: 500 });
    }

    const tenant = await managementDb.tenant.create({
      data: {
        id: tenantId,
        name: body.tenantName,
        connectionUrl,
        status: 'ACTIVE',
      },
      select: { id: true, name: true, status: true, createdAt: true },
    });

    return Response.json({ tenant }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[POST /api/tenants]', message);
    return apiErrorResponse(err);
  }
}
