import { createHash } from 'node:crypto';
import type { Logger } from '../ports/logger.js';
import type { RedisClient } from '../ports/redis-client.js';
import { AuthRateLimitError } from './auth-rate-limit-error.js';

/**
 * Security §4.1 / SEC-013 — same ceilings as login: 5 attempts / 15 minutes.
 * Counts every register attempt (not only failures) to throttle US-01 email
 * enumeration via AUTH_EMAIL_CONFLICT.
 */
export const REGISTER_ABUSE_MAX_ATTEMPTS = 5;
export const REGISTER_ABUSE_WINDOW_SECONDS = 900;

/**
 * Redis-backed registration attempt counters (`rl:register:ip:*` / `rl:register:acct:*`).
 */
export class RegisterAbuseGuard {
  constructor(
    private readonly redis: RedisClient,
    private readonly logger?: Logger,
  ) {}

  async assertAllowed(
    clientIp: string,
    normalizedEmail: string,
  ): Promise<void> {
    const ipRetry = await this.retryAfterIfBlocked(ipAttemptKey(clientIp));
    if (ipRetry !== null) {
      throw new AuthRateLimitError(
        'Too many registration attempts from this IP',
        ipRetry,
      );
    }

    const acctRetry = await this.retryAfterIfBlocked(
      accountAttemptKey(normalizedEmail),
    );
    if (acctRetry !== null) {
      throw new AuthRateLimitError(
        'Too many registration attempts for this email',
        acctRetry,
      );
    }
  }

  /** Bumps IP + email counters after an attempt that reached the use case. */
  async recordAttempt(
    clientIp: string,
    normalizedEmail: string,
  ): Promise<void> {
    const ipCount = await this.bump(ipAttemptKey(clientIp));
    const acctCount = await this.bump(accountAttemptKey(normalizedEmail));

    if (ipCount === REGISTER_ABUSE_MAX_ATTEMPTS) {
      this.logger?.warn('Registration rate limit triggered', {
        trace_id: null,
        account_id: null,
        scope: 'ip',
        clientIp: redactIp(clientIp),
        attempts: ipCount,
        windowSeconds: REGISTER_ABUSE_WINDOW_SECONDS,
      });
    }

    if (acctCount === REGISTER_ABUSE_MAX_ATTEMPTS) {
      this.logger?.warn('Registration rate limit triggered', {
        trace_id: null,
        account_id: null,
        scope: 'email',
        emailHash: hashEmail(normalizedEmail),
        attempts: acctCount,
        windowSeconds: REGISTER_ABUSE_WINDOW_SECONDS,
      });
    }
  }

  private async bump(key: string): Promise<number> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, REGISTER_ABUSE_WINDOW_SECONDS);
    }
    return count;
  }

  private async retryAfterIfBlocked(key: string): Promise<number | null> {
    const raw = await this.redis.get(key);
    if (raw === null) {
      return null;
    }
    const count = Number(raw);
    if (!Number.isFinite(count) || count < REGISTER_ABUSE_MAX_ATTEMPTS) {
      return null;
    }
    const ttl = await this.redis.ttl(key);
    if (ttl === -2) {
      return null;
    }
    return ttl > 0 ? ttl : REGISTER_ABUSE_WINDOW_SECONDS;
  }
}

function ipAttemptKey(clientIp: string): string {
  return `rl:register:ip:${normalizeIp(clientIp)}`;
}

function accountAttemptKey(normalizedEmail: string): string {
  return `rl:register:acct:${hashEmail(normalizedEmail)}`;
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
