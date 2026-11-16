import { createHash } from 'node:crypto';
import type { RedisClient } from '../ports/redis-client.js';
import { ApiRateLimitError } from './api-rate-limit-error.js';

export type ApiRateLimitScope =
  | { readonly kind: 'token'; readonly jti: string }
  | { readonly kind: 'ip'; readonly clientIp: string };

/**
 * Redis-backed global API rate limit (Security §4.1 — per token / anonymous IP).
 * Key prefixes: `rl:api:token:*` / `rl:api:ip:*`.
 */
export class ApiRateLimitGuard {
  constructor(
    private readonly redis: RedisClient,
    private readonly maxRequests: number,
    private readonly windowSeconds: number,
  ) {}

  async assertAllowed(scope: ApiRateLimitScope): Promise<void> {
    const key = scopeKey(scope);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, this.windowSeconds);
    }

    if (count > this.maxRequests) {
      const ttl = await this.redis.ttl(key);
      const retryAfter =
        ttl > 0 ? ttl : Math.max(1, Math.floor(this.windowSeconds));
      throw new ApiRateLimitError(
        'Too many requests — retry after the rate-limit window',
        retryAfter,
      );
    }
  }
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
