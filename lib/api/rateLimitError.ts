export class RateLimitError extends Error {
  constructor(public retryAfterSec: number) {
    super('Too many requests');
    this.name = 'RateLimitError';
  }
}
