import type { AccessTokenDenyList } from '../../application/ports/access-token-deny-list.js';
import type { RedisClient } from '../../application/ports/redis-client.js';

/**
 * INF-022 session keyspace:
 * - `jwt:deny:{jti}` — revoked access JWT
 * - `jwt:acct-epoch:{accountId}` — logout-all watermark (unix seconds)
 */
export class RedisAccessTokenDenyList implements AccessTokenDenyList {
  constructor(private readonly redis: RedisClient) {}

  async revokeJti(jti: string, ttlSeconds: number): Promise<void> {
    const ttl = Math.max(1, Math.floor(ttlSeconds));
    await this.redis.set(jtiKey(jti), '1', { ttlSeconds: ttl });
  }

  async isJtiRevoked(jti: string): Promise<boolean> {
    const value = await this.redis.get(jtiKey(jti));
    return value !== null;
  }

  async revokeAccountEpoch(
    accountId: string,
    revokedAtUnix: number,
    ttlSeconds: number,
  ): Promise<void> {
    const ttl = Math.max(1, Math.floor(ttlSeconds));
    await this.redis.set(accountEpochKey(accountId), String(revokedAtUnix), {
      ttlSeconds: ttl,
    });
  }

  async isAccountEpochRevoked(
    accountId: string,
    issuedAtUnix: number,
  ): Promise<boolean> {
    const raw = await this.redis.get(accountEpochKey(accountId));
    if (raw === null) {
      return false;
    }
    const epoch = Number(raw);
    if (!Number.isFinite(epoch)) {
      return false;
    }
    return issuedAtUnix <= epoch;
  }
}

function jtiKey(jti: string): string {
  return `jwt:deny:${jti.trim()}`;
}

function accountEpochKey(accountId: string): string {
  return `jwt:acct-epoch:${accountId.trim()}`;
}
