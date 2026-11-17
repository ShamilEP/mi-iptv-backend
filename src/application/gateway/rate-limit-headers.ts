import type { ApiRateLimitDecision } from './api-rate-limit-guard.js';

/**
 * Standard rate-limit response headers (BE-008).
 * Uses widely deployed `X-RateLimit-*` names plus `Retry-After` on 429.
 */
export function buildRateLimitHeaders(
  decision: Pick<
    ApiRateLimitDecision,
    'limit' | 'remaining' | 'resetAtUnix' | 'retryAfterSeconds'
  >,
  options?: { readonly includeRetryAfter?: boolean },
): Record<string, string> {
  const headers: Record<string, string> = {
    'x-ratelimit-limit': String(decision.limit),
    'x-ratelimit-remaining': String(Math.max(0, decision.remaining)),
    'x-ratelimit-reset': String(decision.resetAtUnix),
  };
  if (options?.includeRetryAfter === true) {
    headers['retry-after'] = String(
      Math.max(1, Math.floor(decision.retryAfterSeconds)),
    );
  }
  return headers;
}
