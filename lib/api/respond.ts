import { AuthError } from '@/lib/auth/errors';
import { ZodError } from 'zod';
import { bodyErrorToAuth } from '@/lib/api/jsonBody';
import { RateLimitError } from '@/lib/api/rateLimitError';

export { RateLimitError } from '@/lib/api/rateLimitError';

/** Unified JSON error responses for App Router API routes. */
export function apiErrorResponse(err: unknown): Response {
  if (err instanceof AuthError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof RateLimitError) {
    return Response.json(
      { error: err.message },
      {
        status: 429,
        headers: { 'Retry-After': String(err.retryAfterSec) },
      }
    );
  }
  if (err instanceof ZodError) {
    return Response.json(
      { error: 'Validation failed', issues: err.issues },
      { status: 400 }
    );
  }
  const mapped = bodyErrorToAuth(err);
  if (mapped) {
    return Response.json({ error: mapped.message }, { status: mapped.status });
  }
  console.error('[apiErrorResponse] Unexpected error:', err);
  const details =
    process.env.NODE_ENV === 'development' && err instanceof Error
      ? { details: err.message }
      : {};
  return Response.json({ error: 'Internal server error', ...details }, { status: 500 });
}

/** @deprecated Use apiErrorResponse — alias for gradual migration */
export const authErrorResponse = apiErrorResponse;
