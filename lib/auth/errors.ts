/**
 * Shared auth / API error type for route handlers.
 */
export class AuthError extends Error {
  constructor(
    message: string,
    public status: number = 401
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
