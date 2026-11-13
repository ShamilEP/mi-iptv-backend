import { DomainError } from '../../domain/shared/domain-error.js';

/**
 * Login (or auth) rate limit exceeded — map to HTTP 429 + Retry-After (BE-028).
 */
export class AuthRateLimitError extends DomainError {
  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message, 'AUTH_RATE_LIMITED');
    this.name = 'AuthRateLimitError';
  }
}
