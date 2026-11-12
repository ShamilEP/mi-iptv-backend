import { randomUUID } from 'node:crypto';
import { DomainError } from '../../domain/shared/domain-error.js';
import type { AccountRepository } from '../ports/account-repository.js';
import type { RefreshTokenRepository } from '../ports/refresh-token-repository.js';
import type { RefreshTokenService } from '../ports/refresh-token-service.js';
import { IssueAuthTokenPair } from './issue-auth-token-pair.js';

export type RefreshAuthSessionInput = {
  readonly refreshToken: string;
};

export type RefreshAuthSessionResult = {
  readonly accountId: string;
  readonly accessToken: string;
  /** Rotated opaque refresh — client must replace the previous token. */
  readonly refreshToken: string;
  readonly expiresIn: number;
};

/**
 * POST /auth/refresh — rotate refresh tokens and issue a new access JWT (BE-024).
 * Reuse of a spent refresh token revokes the entire family.
 */
export class RefreshAuthSession {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly issueAuthTokenPair: IssueAuthTokenPair,
  ) {}

  async execute(
    input: RefreshAuthSessionInput,
  ): Promise<RefreshAuthSessionResult> {
    const clearToken = input.refreshToken.trim();
    if (clearToken === '') {
      throw new DomainError(
        'refreshToken is required',
        'AUTH_INPUT_INVALID',
      );
    }

    const tokenHash = this.refreshTokenService.hash(clearToken);
    const existing = await this.refreshTokens.findByTokenHash(tokenHash);

    if (existing === null) {
      throw new DomainError('Invalid refresh token', 'AUTH_REFRESH_INVALID');
    }

    if (existing.revokedAt !== null) {
      throw new DomainError('Refresh token revoked', 'AUTH_REFRESH_REVOKED');
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new DomainError('Refresh token expired', 'AUTH_REFRESH_EXPIRED');
    }

    if (existing.usedAt !== null) {
      await this.refreshTokens.revokeFamily(
        existing.familyId,
        'reuse_detected',
        new Date(),
      );
      throw new DomainError(
        'Refresh token reuse detected',
        'AUTH_REFRESH_REUSE',
      );
    }

    const account = await this.accounts.findById(existing.accountId);
    if (account === null || account.status !== 'active') {
      await this.refreshTokens.revokeFamily(
        existing.familyId,
        'logout_all',
        new Date(),
      );
      throw new DomainError('Account is not active', 'AUTH_ACCOUNT_INACTIVE');
    }

    const newId = randomUUID();
    const pair = this.issueAuthTokenPair.execute({
      accountId: account.id,
      deviceId: existing.deviceId,
      roles: [account.role],
      refreshFamilyId: existing.familyId,
    });

    try {
      await this.refreshTokens.markRotated(existing.id, new Date(), newId);
    } catch {
      // Concurrent refresh won the race — treat as reuse.
      await this.refreshTokens.revokeFamily(
        existing.familyId,
        'reuse_detected',
        new Date(),
      );
      throw new DomainError(
        'Refresh token reuse detected',
        'AUTH_REFRESH_REUSE',
      );
    }

    await this.refreshTokens.insert({
      id: newId,
      accountId: account.id,
      deviceId: existing.deviceId,
      familyId: existing.familyId,
      tokenHash: pair.refreshTokenHash,
      issuedAt: new Date(),
      expiresAt: pair.refreshExpiresAt,
      usedAt: null,
      replacedBy: null,
      revokedAt: null,
      revokedReason: null,
    });

    return {
      accountId: account.id,
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      expiresIn: pair.expiresIn,
    };
  }
}
