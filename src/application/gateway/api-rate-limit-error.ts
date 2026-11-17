import { DomainError } from '../../domain/shared/domain-error.js';

export type ApiRateLimitErrorMeta = {
  readonly limit: number;
  readonly remaining: number;
  readonly resetAtUnix: number;
};

/**
 * Global API rate limit exceeded — map to HTTP 429 + rate-limit headers (BE-008).
 */
export class ApiRateLimitError extends DomainError {
  constructor(
    message: string,
    readonly retryAfterSeconds: number,
    readonly meta: ApiRateLimitErrorMeta,
  ) {
    super(message, 'API_RATE_LIMITED');
    this.name = 'ApiRateLimitError';
  }
}
