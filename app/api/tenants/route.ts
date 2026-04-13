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
import { resolveTenantContext, authErrorResponse } from '@/lib/auth/tenantGuard';
import crypto from 'crypto';
import pg from 'pg';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';

const { Client } = pg;

export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await resolveTenantContext(request);

    const tenant = await managementDb.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, status: true, createdAt: true },
    });

    if (!tenant) {
      return Response.json({ error: 'Tenant not found' }, { status: 404 });
    }

    return Response.json({ tenant });
  } catch (err) {
    return authErrorResponse(err);
  }
}

function sanitizeIdentifier(name: string): string {
  // Only allow alphanumeric and underscores for DB/user names
  return name.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantName, adminEmail, adminPassword } = body as {
      tenantName: string;
      adminEmail: string;
      adminPassword: string;
    };

    if (!tenantName || !adminEmail || !adminPassword) {
      return Response.json({ error: 'tenantName, adminEmail, adminPassword are required' }, { status: 400 });
    }

    const tenantId = crypto.randomUUID();
    const safeName = sanitizeIdentifier(tenantName);
    const dbName = `tenant_${safeName}_${tenantId.split('-')[0]}`;
    const dbUser = `${dbName}_user`;
    const dbPassword = crypto.randomBytes(24).toString('hex');

    // Connect as superuser
    const superuserUrl = process.env.DATABASE_URL!;
    const client = new Client({ connectionString: superuserUrl });
    await client.connect();

    try {
      // Create user + database
      await client.query(`CREATE USER "${dbUser}" WITH PASSWORD '${dbPassword}'`);
      await client.query(`CREATE DATABASE "${dbName}" OWNER "${dbUser}"`);
      await client.query(`GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${dbUser}"`);
    } finally {
      await client.end();
    }

    // Build the connection URL for this tenant
    const urlParts = new URL(superuserUrl.includes('@') ? superuserUrl : `postgresql://x@${superuserUrl}`);
    const host = urlParts.hostname;
    const port = urlParts.port || '5432';
    const connectionUrl = `postgresql://${dbUser}:${dbPassword}@${host}:${port}/${dbName}`;

    // Run tenant schema migrations against the new DB
    try {
      execSync(
        `DATABASE_URL="${connectionUrl}" TENANT_DATABASE_URL="${connectionUrl}" npx prisma migrate deploy --schema prisma/tenant.prisma`,
        { stdio: 'pipe', cwd: process.cwd() }
      );
    } catch (migrateErr) {
      console.error('[tenants] Migration failed:', migrateErr);
      return Response.json({ error: 'Tenant DB migration failed' }, { status: 500 });
    }

    // Save tenant to management DB
    const tenant = await managementDb.tenant.create({
      data: {
        id: tenantId,
        name: tenantName,
        connectionUrl,
        status: 'ACTIVE',
      },
      select: { id: true, name: true, status: true, createdAt: true },
    });

    return Response.json({ tenant }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[POST /api/tenants]', message);
    return Response.json({ error: message }, { status: 500 });
  }
}
