export type RefreshTokenRecord = {
  readonly id: string;
  readonly accountId: string;
  readonly deviceId: string;
  readonly familyId: string;
  readonly tokenHash: Uint8Array;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly replacedBy: string | null;
  readonly revokedAt: Date | null;
  readonly revokedReason: string | null;
};

export type NewRefreshTokenRecord = Omit<
  RefreshTokenRecord,
  'usedAt' | 'replacedBy' | 'revokedAt' | 'revokedReason'
> & {
  readonly usedAt?: Date | null;
  readonly replacedBy?: string | null;
  readonly revokedAt?: Date | null;
  readonly revokedReason?: string | null;
};

export type RefreshTokenRevokeReason =
  | 'logout'
  | 'logout_all'
  | 'reuse_detected'
  | 'password_reset'
  | 'device_unlinked'
  | 'account_deleted';

/**
 * Persists hashed refresh tokens (ADR-004 / schema app.refresh_tokens).
 */
export interface RefreshTokenRepository {
  insert(row: NewRefreshTokenRecord): Promise<RefreshTokenRecord>;
  findByTokenHash(tokenHash: Uint8Array): Promise<RefreshTokenRecord | null>;
  /**
   * Marks a still-active token as rotated. Must fail if already used or revoked
   * (supports reuse detection under concurrent refresh).
   */
  markRotated(
    id: string,
    usedAt: Date,
    replacedBy: string,
  ): Promise<RefreshTokenRecord>;
  /** Revokes every token in the rotation family (reuse / logout_all). */
  revokeFamily(
    familyId: string,
    reason: RefreshTokenRevokeReason,
    revokedAt: Date,
  ): Promise<number>;

  /** Revokes active refresh tokens for one device (POST /auth/logout). */
  revokeByDevice(
    accountId: string,
    deviceId: string,
    reason: RefreshTokenRevokeReason,
    revokedAt: Date,
  ): Promise<number>;

  /** Revokes every active refresh token for the account (logout all sessions). */
  revokeByAccount(
    accountId: string,
    reason: RefreshTokenRevokeReason,
    revokedAt: Date,
  ): Promise<number>;

  /** Hard-delete refresh token rows for the account (BE-013 cascade). */
  deleteByAccount(accountId: string): Promise<number>;
}
