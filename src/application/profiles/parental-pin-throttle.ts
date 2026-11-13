import type { Logger } from '../ports/logger.js';
import type { RedisClient } from '../ports/redis-client.js';
import { AuthRateLimitError } from '../auth/auth-rate-limit-error.js';

/** Parental PIN verify lockout — aligned with login window (BE-037 / Security §4). */
export const PARENTAL_PIN_MAX_FAILURES = 5;
export const PARENTAL_PIN_WINDOW_SECONDS = 900;

/**
 * Redis-backed parental PIN failure counters (`rl:pin:{accountId}:{profileId}`).
 */
export class ParentalPinThrottle {
  constructor(
    private readonly redis: RedisClient,
    private readonly logger?: Logger,
  ) {}

  async assertAllowed(accountId: string, profileId: string): Promise<void> {
    const retry = await this.retryAfterIfBlocked(pinFailKey(accountId, profileId));
    if (retry !== null) {
      throw new AuthRateLimitError(
        'Too many parental PIN attempts for this profile',
        retry,
      );
    }
  }

  async recordFailure(accountId: string, profileId: string): Promise<void> {
    const key = pinFailKey(accountId, profileId);
    const count = await this.bump(key);
    if (count === PARENTAL_PIN_MAX_FAILURES) {
      this.logger?.warn('Parental PIN lockout triggered', {
        trace_id: null,
        account_id: accountId,
        profile_id: profileId,
        failures: count,
        windowSeconds: PARENTAL_PIN_WINDOW_SECONDS,
      });
    }
  }

  async clearFailures(accountId: string, profileId: string): Promise<void> {
    await this.redis.del(pinFailKey(accountId, profileId));
  }

  private async bump(key: string): Promise<number> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, PARENTAL_PIN_WINDOW_SECONDS);
    }
    return count;
  }

  private async retryAfterIfBlocked(key: string): Promise<number | null> {
    const raw = await this.redis.get(key);
    if (raw === null) {
      return null;
    }
    const count = Number.parseInt(raw, 10);
    if (!Number.isFinite(count) || count < PARENTAL_PIN_MAX_FAILURES) {
      return null;
    }
    const ttl = await this.redis.ttl(key);
    return ttl > 0 ? ttl : PARENTAL_PIN_WINDOW_SECONDS;
  }
}

function pinFailKey(accountId: string, profileId: string): string {
  return `rl:pin:${accountId}:${profileId}`;
}
