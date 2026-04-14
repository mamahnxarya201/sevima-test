#!/usr/bin/env tsx
/**
 * scripts/create-tenant-rbac-users.ts
 *
 * Adds one RBAC user (ADMIN, EDITOR, VIEWER) to an existing tenant by tenant name.
 *
 * First-start flow:
 *  1) Register tenant in the app (/register). That creates the first ADMIN user.
 *  2) Run this script to add more users by role.
 *
 * Usage:
 *   npm run seed:rbac -- --tenant "tenant-name" --role EDITOR
 *
 * Optional:
 *   --email <email>      default: rbac-<role>-<tenantSlug>@example.local
 *   --name <full name>   default: RBAC <ROLE>
 *   --password <pwd>     default: DevPassword123! (min 8 chars)
 *
 * Env: MANAGEMENT_DATABASE_URL, BETTER_AUTH_URL, BETTER_AUTH_SECRET, etc.
 * Loads .env.local / .env if present.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function loadEnvSync() {
  for (const name of ['.env.local', '.env']) {
    const p = resolve(process.cwd(), name);
    if (!existsSync(p)) continue;
    const text = readFileSync(p, 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}

function sanitizeIdentifier(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40);
}

type AppRole = 'ADMIN' | 'EDITOR' | 'VIEWER';

function normalizeRole(raw: string | undefined): AppRole | null {
  const value = String(raw ?? '').toUpperCase();
  if (value === 'ADMIN' || value === 'EDITOR' || value === 'VIEWER') {
    return value;
  }
  return null;
}

function parseArgs(argv: string[]) {
  const out: {
    tenant?: string;
    role?: AppRole;
    email?: string;
    name?: string;
    password: string;
    help: boolean;
  } = { password: 'DevPassword123!', help: false };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--tenant' && argv[i + 1]) {
      out.tenant = argv[++i];
    } else if (a === '--role' && argv[i + 1]) {
      const parsed = normalizeRole(argv[++i]);
      if (parsed) out.role = parsed;
    } else if (a === '--email' && argv[i + 1]) {
      out.email = argv[++i];
    } else if (a === '--name' && argv[i + 1]) {
      out.name = argv[++i];
    } else if (a === '--password' && argv[i + 1]) {
      out.password = argv[++i];
    }
  }
  return out;
}

async function signUpUser(
  auth: typeof import('../lib/auth/auth').auth,
  input: {
    name: string;
    email: string;
    password: string;
    role: AppRole;
    tenantId: string;
  }
) {
  try {
    const result = await auth.api.signUpEmail({
      body: {
        name: input.name,
        email: input.email,
        password: input.password,
        role: input.role,
        tenantId: input.tenantId,
      },
    });

    if (result && typeof result === 'object' && 'user' in result && result.user) {
      return result.user as { id: string; email: string; role?: string };
    }
  } catch (e: unknown) {
    const err = e as { message?: string; body?: { message?: string; code?: string } };
    const detail = err.body?.message ?? err.body?.code ?? err.message ?? String(e);
    throw new Error(detail);
  }
  throw new Error(`Unexpected sign-up response for ${input.email}`);
}

async function main() {
  loadEnvSync();

  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage:
  npm run seed:rbac -- --tenant "tenant-name" --role EDITOR

Optional:
  --email <email>      default: rbac-<role>-<tenantSlug>@example.local
  --name <full name>   default: RBAC <ROLE>
  --password <pwd>     default: DevPassword123!
`);
    process.exit(0);
  }

  try {
    if (args.password.length < 8) {
      throw new Error('Password must be at least 8 characters (Better Auth minimum).');
    }
    if (!args.tenant?.trim()) {
      throw new Error('Missing --tenant "<tenant-name>".');
    }
    if (!args.role) {
      throw new Error('Missing --role <ADMIN|EDITOR|VIEWER>.');
    }

    const tenantName = args.tenant.trim();
    const { managementDb } = await import('../lib/prisma/management');
    const tenants = await managementDb.tenant.findMany({
      where: { name: tenantName, status: 'ACTIVE' },
      select: { id: true, name: true },
      take: 2,
    });
    if (tenants.length === 0) {
      throw new Error(
        `Tenant "${tenantName}" not found. Register tenant first in /register (first admin is created there).`
      );
    }
    if (tenants.length > 1) {
      throw new Error(
        `Multiple active tenants found with name "${tenantName}". Use a unique tenant name before seeding users.`
      );
    }
    const tenant = tenants[0];
    if (!tenant) throw new Error('Tenant lookup failed.');

    const { auth } = await import('../lib/auth/auth');

    const tenantSlug = sanitizeIdentifier(tenant.name) || 'tenant';
    const role = args.role;
    const email = args.email ?? `rbac-${role.toLowerCase()}-${tenantSlug}@example.local`;
    const name = args.name ?? `RBAC ${role}`;

    console.log(`Creating ${role} user for tenant "${tenant.name}"...`);

    const created = await signUpUser(auth, {
      name,
      email,
      password: args.password,
      role,
      tenantId: tenant.id,
    });

    console.log(`
Done.

Tenant:   ${tenant.name} (${tenant.id})
Role:     ${role}
Email:    ${created.email}
Password: ${args.password}

Log in at /login with this user.
JWT will include role + tenantId.

Expected RBAC:
  - ADMIN / EDITOR: POST /api/workflows, PATCH workflows, POST run, canvas WS sync - allowed.
  - VIEWER: GET workflows and workflow by id - allowed; mutations - 403.
`);
  } finally {
    try {
      const { managementDb } = await import('../lib/prisma/management');
      await managementDb.$disconnect();
    } catch {
      /* prisma may never have been imported */
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
