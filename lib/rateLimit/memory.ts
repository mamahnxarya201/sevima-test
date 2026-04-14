/**
 * Fixed-window in-memory rate limiter (per Node process).
 * For multi-instance production, replace with Redis/edge limits.
 */

import { RateLimitError } from '@/lib/api/rateLimitError';

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();

function pruneIfNeeded() {
  if (store.size < 50_000) return;
  const now = Date.now();
  for (const [k, b] of store) {
    if (now > b.resetAt) store.delete(k);
  }
}

/**
 * @param key — e.g. `userId:route` or `ip:route`
 * @param limit — max requests per window
 * @param windowMs — window length in ms
 */
export function takeRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  pruneIfNeeded();
  const now = Date.now();
  let b = store.get(key);
  if (!b || now > b.resetAt) {
    b = { count: 0, resetAt: now + windowMs };
    store.set(key, b);
  }
  if (b.count < limit) {
    b.count += 1;
    return { ok: true };
  }
  const retryAfterSec = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
  return { ok: false, retryAfterSec };
}

export function rateLimitConfig() {
  return {
    windowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS) || 60_000,
    max: Number(process.env.API_RATE_LIMIT_MAX) || 200,
    mutationMax: Number(process.env.API_RATE_LIMIT_MUTATION_MAX) || 80,
    tenantRegisterWindowMs: Number(process.env.TENANT_REGISTER_RATE_LIMIT_WINDOW_MS) || 3_600_000,
    tenantRegisterMax: Number(process.env.TENANT_REGISTER_RATE_LIMIT_MAX) || 10,
  };
}

export function enforceRateLimit(key: string, limit: number, windowMs: number): void {
  const r = takeRateLimit(key, limit, windowMs);
  if (!r.ok) throw new RateLimitError(r.retryAfterSec);
}
