#!/usr/bin/env tsx
/**
 * scripts/migrate-tenants.ts
 *
 * CLI: npm run migrate:tenants
 *
 * Reads all ACTIVE tenants from the management DB and runs
 * `prisma migrate deploy` against each tenant's isolated Postgres DB.
 * Safe to run multiple times (idempotent).
 */

import { execSync } from 'child_process';
import { PrismaClient } from '../lib/generated/management-client';
import path from 'path';

const managementDb = new PrismaClient({
  datasources: { db: { url: process.env.MANAGEMENT_DATABASE_URL } },
});

async function main() {
  console.log('🔍 Fetching active tenants from management DB…');

  const tenants = await managementDb.tenant.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, connectionUrl: true },
  });

  if (tenants.length === 0) {
    console.log('ℹ️  No active tenants found. Exiting.');
    return;
  }

  console.log(`📦 Migrating ${tenants.length} tenant(s)…\n`);

  let success = 0;
  let failed = 0;

  for (const tenant of tenants) {
    process.stdout.write(`  → ${tenant.name} (${tenant.id.slice(0, 8)})… `);
    try {
      execSync(
        `npx prisma migrate deploy --schema ${path.join(process.cwd(), 'prisma/tenant/schema.prisma')}`,
        {
          stdio: 'pipe',
          env: {
            ...process.env,
            TENANT_DATABASE_URL: tenant.connectionUrl,
            DATABASE_URL: tenant.connectionUrl,
          },
          cwd: process.cwd(),
        }
      );
      console.log('✅');
      success++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`❌  ${message.slice(0, 120)}`);
      failed++;
    }
  }

  console.log(`\n✨ Done: ${success} succeeded, ${failed} failed.`);
  await managementDb.$disconnect();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
