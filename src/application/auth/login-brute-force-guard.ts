import { createHash } from 'node:crypto';
import type { Logger } from '../ports/logger.js';
import type { RedisClient } from '../ports/redis-client.js';
import { AuthRateLimitError } from './auth-rate-limit-error.js';

/** Security §4.1 / INF-022 — 5 failures / 15 minutes. */
export const LOGIN_BRUTE_FORCE_MAX_FAILURES = 5;
export const LOGIN_BRUTE_FORCE_WINDOW_SECONDS = 900;

/**
 * Redis-backed login failure counters (INF-022 `rl:login:ip:*` / `rl:login:acct:*`).
 */
export class LoginBruteForceGuard {
  constructor(
    private readonly redis: RedisClient,
    private readonly logger?: Logger,
  ) {}

  async assertAllowed(
    clientIp: string,
    normalizedEmail: string,
  ): Promise<void> {
    const ipRetry = await this.retryAfterIfBlocked(ipFailKey(clientIp));
    if (ipRetry !== null) {
      throw new AuthRateLimitError(
        'Too many login attempts from this IP',
        ipRetry,
      );
    }

    const acctRetry = await this.retryAfterIfBlocked(
      accountFailKey(normalizedEmail),
    );
    if (acctRetry !== null) {
      throw new AuthRateLimitError(
        'Too many login attempts for this account',
        acctRetry,
      );
    }
  }

  async recordFailure(
    clientIp: string,
    normalizedEmail: string,
  ): Promise<void> {
    const ipCount = await this.bump(ipFailKey(clientIp));
    const acctCount = await this.bump(accountFailKey(normalizedEmail));

    if (ipCount === LOGIN_BRUTE_FORCE_MAX_FAILURES) {
      this.logger?.warn('Login lockout triggered', {
        trace_id: null,
        account_id: null,
        scope: 'ip',
        clientIp: redactIp(clientIp),
        failures: ipCount,
        windowSeconds: LOGIN_BRUTE_FORCE_WINDOW_SECONDS,
      });
    }

    if (acctCount === LOGIN_BRUTE_FORCE_MAX_FAILURES) {
      this.logger?.warn('Login lockout triggered', {
        trace_id: null,
        account_id: null,
        scope: 'account',
        emailHash: hashEmail(normalizedEmail),
        failures: acctCount,
        windowSeconds: LOGIN_BRUTE_FORCE_WINDOW_SECONDS,
      });
    }
  }

  async clearFailures(
    clientIp: string,
    normalizedEmail: string,
  ): Promise<void> {
    await this.redis.del(ipFailKey(clientIp), accountFailKey(normalizedEmail));
  }

  private async bump(key: string): Promise<number> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, LOGIN_BRUTE_FORCE_WINDOW_SECONDS);
    }
    return count;
  }

  /** Returns Retry-After seconds when the counter has reached the max. */
  private async retryAfterIfBlocked(key: string): Promise<number | null> {
    const raw = await this.redis.get(key);
    if (raw === null) {
      return null;
    }
    const count = Number(raw);
    if (!Number.isFinite(count) || count < LOGIN_BRUTE_FORCE_MAX_FAILURES) {
      return null;
    }
    const ttl = await this.redis.ttl(key);
    if (ttl === -2) {
      return null;
    }
    return ttl > 0 ? ttl : LOGIN_BRUTE_FORCE_WINDOW_SECONDS;
  }
}

function ipFailKey(clientIp: string): string {
  return `rl:login:ip:${normalizeIp(clientIp)}`;
}

function accountFailKey(normalizedEmail: string): string {
  return `rl:login:acct:${hashEmail(normalizedEmail)}`;
}

function hashEmail(normalizedEmail: string): string {
  return createHash('sha256').update(normalizedEmail).digest('hex');
}

function normalizeIp(clientIp: string): string {
  const trimmed = clientIp.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : 'unknown';
}

function redactIp(clientIp: string): string {
  const ip = normalizeIp(clientIp);
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.x`;
    }
  }
  return 'redacted';
}
