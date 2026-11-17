import { createHash } from 'node:crypto';
import type { RedisClient } from '../ports/redis-client.js';
import { ApiRateLimitError } from './api-rate-limit-error.js';

export type ApiRateLimitScope =
  | { readonly kind: 'token'; readonly jti: string }
  | { readonly kind: 'ip'; readonly clientIp: string };

export type ApiRateLimitDecision = {
  readonly limit: number;
  readonly remaining: number;
  readonly resetAtUnix: number;
  readonly retryAfterSeconds: number;
};

/**
 * Redis-backed global API rate limit (BE-008 / Security §4.1).
 * Authenticated: 100/min per access-token `jti`.
 * Unauthenticated: stricter per-IP budget.
 * Keys: `rl:api:token:*` / `rl:api:ip:*` (INF-022 session instance).
 */
export class ApiRateLimitGuard {
  constructor(
    private readonly redis: RedisClient,
    private readonly tokenMaxRequests: number,
    private readonly anonymousMaxRequests: number,
    private readonly windowSeconds: number,
  ) {}

  async consume(scope: ApiRateLimitScope): Promise<ApiRateLimitDecision> {
    const limit = maxForScope(
      scope,
      this.tokenMaxRequests,
      this.anonymousMaxRequests,
    );
    const key = scopeKey(scope);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, this.windowSeconds);
    }

    const ttl = await this.redis.ttl(key);
    const retryAfterSeconds =
      ttl > 0 ? ttl : Math.max(1, Math.floor(this.windowSeconds));
    const resetAtUnix = Math.floor(Date.now() / 1000) + retryAfterSeconds;
    const remaining = Math.max(0, limit - count);

    if (count > limit) {
      throw new ApiRateLimitError(
        'Too many requests — retry after the rate-limit window',
        retryAfterSeconds,
        { limit, remaining: 0, resetAtUnix },
      );
    }

    return {
      limit,
      remaining,
      resetAtUnix,
      retryAfterSeconds,
    };
  }
}

function maxForScope(
  scope: ApiRateLimitScope,
  tokenMax: number,
  anonymousMax: number,
): number {
  return scope.kind === 'token' ? tokenMax : anonymousMax;
}

function scopeKey(scope: ApiRateLimitScope): string {
  if (scope.kind === 'token') {
    return `rl:api:token:${scope.jti}`;
  }
  const ipHash = createHash('sha256')
    .update(scope.clientIp.trim().toLowerCase())
    .digest('hex')
    .slice(0, 32);
  return `rl:api:ip:${ipHash}`;
}
