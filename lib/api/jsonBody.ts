import { AuthError } from '@/lib/auth/errors';

const DEFAULT_MAX = 1_000_000;

export class PayloadTooLargeError extends Error {
  constructor() {
    super('Payload too large');
    this.name = 'PayloadTooLargeError';
  }
}

export class MalformedJsonError extends Error {
  constructor() {
    super('Invalid JSON body');
    this.name = 'MalformedJsonError';
  }
}

/**
 * Read and parse JSON with a max byte size (default 1MB).
 */
export async function readJsonBody(request: Request, maxBytes: number = DEFAULT_MAX): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) {
    throw new PayloadTooLargeError();
  }
  const t = text.trim();
  if (!t) return {};
  try {
    return JSON.parse(t) as unknown;
  } catch {
    throw new MalformedJsonError();
  }
}

/** Map body errors to AuthError for apiErrorResponse */
export function bodyErrorToAuth(err: unknown): AuthError | null {
  if (err instanceof PayloadTooLargeError) {
    return new AuthError(err.message, 413);
  }
  if (err instanceof MalformedJsonError) {
    return new AuthError(err.message, 400);
  }
  return null;
}
