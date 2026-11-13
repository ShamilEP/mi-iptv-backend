import type { AccessTokenClaims } from '../../domain/auth/access-token-claims.js';
import { AuthTokenError } from '../../domain/auth/auth-token-error.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import type { AccessTokenDenyList } from '../ports/access-token-deny-list.js';
import type { AccessTokenService } from '../ports/access-token-service.js';
import type { AccountRepository } from '../ports/account-repository.js';
import type { DeviceRepository } from '../ports/device-repository.js';
import type { FavoriteSyncRepository } from '../ports/favorite-sync-repository.js';
import type { PlaybackSyncRepository } from '../ports/playback-sync-repository.js';
import type { ProfileRepository } from '../ports/profile-repository.js';
import type { RefreshTokenRepository } from '../ports/refresh-token-repository.js';
import type { SourceRepository } from '../ports/source-repository.js';
import type { SyncLogRepository } from '../ports/sync-log-repository.js';

export type DeleteAccountInput = {
  readonly accessToken: string;
};

export type DeleteAccountResult = {
  readonly status: 'OK';
  readonly accountId: string;
};

/**
 * DELETE /account — revoke all tokens then cascade-delete tenant data (BE-013).
 * Mirrors Postgres ON DELETE CASCADE across profiles, sources, devices, and sync.
 */
export class DeleteAccount {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly denyList: AccessTokenDenyList,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly accounts: AccountRepository,
    private readonly profiles: ProfileRepository,
    private readonly sources: SourceRepository,
    private readonly devices: DeviceRepository,
    private readonly favorites: FavoriteSyncRepository,
    private readonly playback: PlaybackSyncRepository,
    private readonly syncLog: SyncLogRepository,
    private readonly accessTokenTtlSeconds: number,
  ) {}

  async execute(input: DeleteAccountInput): Promise<DeleteAccountResult> {
    const clear = input.accessToken.trim();
    if (clear === '') {
      throw new DomainError('accessToken is required', 'AUTH_INPUT_INVALID');
    }

    const claims = this.verifyAccess(clear);
    const account = await this.accounts.findById(claims.accountId);
    if (account === null) {
      throw new DomainError('Account not found', 'AUTH_ACCOUNT_NOT_FOUND');
    }

    const now = new Date();
    const nowUnix = Math.floor(now.getTime() / 1000);
    const remainingTtl = Math.max(1, claims.expiresAtUnix - nowUnix);

    // 1. Revoke sessions before hard-delete (Security §2.2 / NFR-006).
    await this.denyList.revokeJti(claims.jti, remainingTtl);
    await this.denyList.revokeAccountEpoch(
      claims.accountId,
      nowUnix,
      Math.max(1, this.accessTokenTtlSeconds),
    );
    await this.refreshTokens.revokeByAccount(
      claims.accountId,
      'account_deleted',
      now,
    );

    // 2. Cascade purge (Sprint 0 in-memory; Postgres uses FK CASCADE).
    await this.favorites.deleteByAccount(claims.accountId);
    await this.playback.deleteByAccount(claims.accountId);
    await this.syncLog.deleteByAccount(claims.accountId);
    await this.sources.deleteByAccount(claims.accountId);
    await this.devices.deleteByAccount(claims.accountId);
    await this.profiles.deleteByAccount(claims.accountId);
    await this.refreshTokens.deleteByAccount(claims.accountId);

    const deleted = await this.accounts.delete(claims.accountId);
    if (!deleted) {
      throw new DomainError('Account not found', 'AUTH_ACCOUNT_NOT_FOUND');
    }

    return { status: 'OK', accountId: claims.accountId };
  }

  private verifyAccess(token: string): AccessTokenClaims {
    try {
      return this.accessTokens.verify(token);
    } catch (error: unknown) {
      if (error instanceof AuthTokenError) {
        throw new DomainError(error.message, 'AUTH_ACCESS_INVALID');
      }
      throw new DomainError('Invalid access token', 'AUTH_ACCESS_INVALID');
    }
  }
}
