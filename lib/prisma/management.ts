/**
 * lib/prisma/management.ts
 *
 * Singleton management Prisma client.
 * Points to the central Postgres DB that stores Tenants and Users.
 *
 * Uses a global variable to prevent multiple client instances in Next.js
 * hot-reload (dev) scenarios.
 */

import { PrismaClient } from '../generated/management-client';

declare global {
   
  var __management_prisma: PrismaClient | undefined;
}

export const managementDb: PrismaClient =
  globalThis.__management_prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__management_prisma = managementDb;
}
