import { DomainError } from '../../domain/shared/domain-error.js';

/**
 * Global API rate limit exceeded — map to HTTP 429 + Retry-After (BE-006).
 */
export class ApiRateLimitError extends DomainError {
  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message, 'API_RATE_LIMITED');
    this.name = 'ApiRateLimitError';
  }
}
