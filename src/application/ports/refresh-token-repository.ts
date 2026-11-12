export type RefreshTokenRecord = {
  readonly id: string;
  readonly accountId: string;
  readonly deviceId: string;
  readonly familyId: string;
  readonly tokenHash: Uint8Array;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly revokedReason: string | null;
};

export type NewRefreshTokenRecord = Omit<
  RefreshTokenRecord,
  'usedAt' | 'revokedAt' | 'revokedReason'
> & {
  readonly usedAt?: Date | null;
  readonly revokedAt?: Date | null;
  readonly revokedReason?: string | null;
};

/**
 * Persists hashed refresh tokens (ADR-004 / schema app.refresh_tokens).
 */
export interface RefreshTokenRepository {
  insert(row: NewRefreshTokenRecord): Promise<RefreshTokenRecord>;
  findByTokenHash(tokenHash: Uint8Array): Promise<RefreshTokenRecord | null>;
}
