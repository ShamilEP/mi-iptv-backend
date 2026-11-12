import type { AccessTokenService } from '../ports/access-token-service.js';
import type { RefreshTokenService } from '../ports/refresh-token-service.js';

export type IssueAuthTokenPairInput = {
  readonly accountId: string;
  readonly deviceId: string;
  readonly roles: readonly string[];
  readonly refreshFamilyId?: string;
};

export type AuthTokenPair = {
  readonly accessToken: string;
  /** Access TTL seconds — API `expiresIn` (ADR-004: 3600). */
  readonly expiresIn: number;
  readonly refreshToken: string;
  readonly refreshTokenHash: Uint8Array;
  readonly refreshFamilyId: string;
  readonly refreshExpiresAt: Date;
  readonly accountId: string;
  readonly deviceId: string;
  readonly accessJti: string;
};

/**
 * Issues an access JWT + device-bound opaque refresh token (BE-023).
 * Does not persist; callers store refreshTokenHash via a repository.
 */
export class IssueAuthTokenPair {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  execute(input: IssueAuthTokenPairInput): AuthTokenPair {
    const access = this.accessTokens.issue({
      accountId: input.accountId,
      deviceId: input.deviceId,
      roles: input.roles,
    });
    const refresh = this.refreshTokens.issue({
      accountId: input.accountId,
      deviceId: input.deviceId,
      ...(input.refreshFamilyId !== undefined
        ? { familyId: input.refreshFamilyId }
        : {}),
    });

    return {
      accessToken: access.token,
      expiresIn: access.expiresInSeconds,
      refreshToken: refresh.token,
      refreshTokenHash: refresh.tokenHash,
      refreshFamilyId: refresh.familyId,
      refreshExpiresAt: refresh.expiresAt,
      accountId: input.accountId,
      deviceId: input.deviceId,
      accessJti: access.claims.jti,
    };
  }
}
