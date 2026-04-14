/**
 * Role hierarchy: VIEWER < EDITOR < ADMIN (matches prisma/management Role enum).
 * JWT `role` claim is normalized to uppercase.
 */

import { AuthError } from './errors';

export const APP_ROLES = ['VIEWER', 'EDITOR', 'ADMIN'] as const;
export type AppRole = (typeof APP_ROLES)[number];

const RANK: Record<AppRole, number> = {
  VIEWER: 0,
  EDITOR: 1,
  ADMIN: 2,
};

export function normalizeRole(raw: string | undefined): AppRole {
  const u = (raw ?? 'VIEWER').toUpperCase();
  if (u === 'ADMIN' || u === 'EDITOR' || u === 'VIEWER') {
    return u;
  }
  return 'VIEWER';
}

/** Create/update workflows, run workflows, WS canvas sync. */
export function requireEditorOrAbove(role: AppRole): void {
  if (RANK[role] < RANK.EDITOR) {
    throw new AuthError('Insufficient permissions', 403);
  }
}

/** Reserved for future tenant-admin-only routes. */
export function requireAdmin(role: AppRole): void {
  if (role !== 'ADMIN') {
    throw new AuthError('Insufficient permissions', 403);
  }
}
