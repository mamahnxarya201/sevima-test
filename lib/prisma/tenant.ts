/**
 * lib/prisma/tenant.ts
 *
 * Dynamic per-tenant Prisma client factory.
 *
 * HOW IT WORKS:
 * Prisma supports overriding the datasource URL at instantiation time using:
 *   new PrismaClient({ datasources: { db: { url: connectionUrl } } })
 *
 * The `TENANT_DATABASE_URL` env var in prisma/tenant/schema.prisma is only used during
 * schema migrations (`prisma migrate deploy --schema prisma/tenant/schema.prisma`).
 * At runtime, every request provides its own tenant connection URL fetched
 * from the management DB based on the JWT's tenantId claim.
 *
 * CACHING:
 * We maintain a simple Map<connectionUrl, PrismaClient> cache so that we
 * don't create a new client on every request. In production with many
 * tenants, consider an LRU cache with a size cap.
 */

import { PrismaClient } from '../generated/tenant-client';

const tenantClientCache = new Map<string, PrismaClient>();

/**
 * Returns a PrismaClient instance pointed at the given tenant database.
 * Instances are cached per connectionUrl.
 */
export function getTenantDb(connectionUrl: string): PrismaClient {
  const cached = tenantClientCache.get(connectionUrl);
  if (cached) return cached;

  const client = new PrismaClient({
    datasources: {
      db: { url: connectionUrl },
    },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  tenantClientCache.set(connectionUrl, client);
  return client;
}

/**
 * Call this when a tenant is de-provisioned to clean up the cached client.
 */
export async function disconnectTenantDb(connectionUrl: string): Promise<void> {
  const client = tenantClientCache.get(connectionUrl);
  if (client) {
    await client.$disconnect();
    tenantClientCache.delete(connectionUrl);
  }
}
