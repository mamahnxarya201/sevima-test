#!/usr/bin/env tsx
/**
 * scripts/migrate-tenants.ts
 *
 * Applies pending Prisma migrations to every tenant database.
 *
 * Usage:
 *   npm run migrate:tenants            # migrate all active tenants
 *   npm run migrate:tenants -- --dry   # preview which tenants would be migrated
 *
 * What it does:
 *   1. Connects to the management DB
 *   2. Fetches all tenants (optionally filtered by status)
 *   3. For each tenant, runs `prisma migrate deploy --schema prisma/tenant/schema.prisma`
 *      with TENANT_DATABASE_URL overridden to that tenant's connectionUrl
 *   4. Prints a summary of successes and failures
 *
 * Safe by design:
 *   - Uses `migrate deploy` (not `migrate dev`): only applies existing migration files,
 *     never generates new ones or resets data.
 *   - One tenant failing does not stop the others.
 *   - Dry-run mode lets you check before committing.
 */

import { execSync } from 'child_process';
import { PrismaClient } from '../lib/generated/management-client';

const SCHEMA_PATH = 'prisma/tenant/schema.prisma';

interface Result {
  tenantId: string;
  name: string;
  ok: boolean;
  message: string;
  durationMs: number;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry');

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║        Tenant Database Migration Runner         ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log();

  if (dryRun) {
    console.log('  Mode: DRY RUN (no changes will be applied)\n');
  }

  const mgmt = new PrismaClient();

  try {
    const tenants = await mgmt.tenant.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
    });

    if (tenants.length === 0) {
      console.log('  No active tenants found. Nothing to do.\n');
      return;
    }

    console.log(`  Found ${tenants.length} active tenant(s):\n`);
    for (const t of tenants) {
      const masked = maskConnectionUrl(t.connectionUrl);
      console.log(`    • ${t.name} (${t.id}) → ${masked}`);
    }
    console.log();

    if (dryRun) {
      console.log('  Dry run complete. Re-run without --dry to apply migrations.\n');
      return;
    }

    const results: Result[] = [];

    for (let i = 0; i < tenants.length; i++) {
      const t = tenants[i];
      const label = `[${i + 1}/${tenants.length}] ${t.name}`;
      process.stdout.write(`  ${label}: migrating...`);

      const start = Date.now();
      try {
        const output = execSync(
          `npx prisma migrate deploy --schema ${SCHEMA_PATH}`,
          {
            env: { ...process.env, TENANT_DATABASE_URL: t.connectionUrl },
            timeout: 120_000, // 2 min per tenant
            stdio: ['pipe', 'pipe', 'pipe'],
          },
        );
        const ms = Date.now() - start;
        const stdout = output.toString().trim();
        const applied = extractAppliedCount(stdout);
        const msg = applied > 0
          ? `${applied} migration(s) applied`
          : 'already up to date';
        results.push({ tenantId: t.id, name: t.name, ok: true, message: msg, durationMs: ms });
        process.stdout.write(`\r  ${label}: ✓ ${msg} (${ms}ms)\n`);
      } catch (err: any) {
        const ms = Date.now() - start;
        const stderr = err.stderr?.toString().trim() ?? err.message ?? 'unknown error';
        const shortErr = stderr.split('\n').slice(0, 3).join(' | ');
        results.push({ tenantId: t.id, name: t.name, ok: false, message: shortErr, durationMs: ms });
        process.stdout.write(`\r  ${label}: ✗ FAILED (${ms}ms)\n`);
        console.error(`    Error: ${shortErr}\n`);
      }
    }

    // Summary
    const succeeded = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);

    console.log('\n  ─── Summary ───────────────────────────────────');
    console.log(`  Total:     ${results.length}`);
    console.log(`  Succeeded: ${succeeded.length}`);
    console.log(`  Failed:    ${failed.length}`);

    if (failed.length > 0) {
      console.log('\n  Failed tenants:');
      for (const f of failed) {
        console.log(`    ✗ ${f.name} (${f.tenantId}): ${f.message}`);
      }
      process.exitCode = 1;
    }

    console.log();
  } finally {
    await mgmt.$disconnect();
  }
}

function maskConnectionUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '****';
    }
    return parsed.toString();
  } catch {
    return url.replace(/:([^@/]+)@/, ':****@');
  }
}

function extractAppliedCount(output: string): number {
  // Prisma outputs "X migrations have been applied" or "already in sync"
  const match = output.match(/(\d+)\s+migration/i);
  return match ? parseInt(match[1], 10) : 0;
}

main().catch((err) => {
  console.error('\n  Fatal error:', err);
  process.exitCode = 1;
});
