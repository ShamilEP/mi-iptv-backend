/**
 * Redis/Valkey access-token revoke list (INF-022 `jwt:deny:{jti}`).
 * Domain/application never import Redis SDKs — adapters implement this port.
 */
export interface AccessTokenDenyList {
  /** Deny a single access JWT until its natural expiry. */
  revokeJti(jti: string, ttlSeconds: number): Promise<void>;

  isJtiRevoked(jti: string): Promise<boolean>;

  /**
   * Marks all access tokens for the account issued at/before `revokedAtUnix`
   * as invalid (logout-all). TTL covers the max access-token lifetime.
   */
  revokeAccountEpoch(
    accountId: string,
    revokedAtUnix: number,
    ttlSeconds: number,
  ): Promise<void>;

  /**
   * True when `issuedAtUnix` is at or before the account logout-all epoch.
   */
  isAccountEpochRevoked(
    accountId: string,
    issuedAtUnix: number,
  ): Promise<boolean>;
}
