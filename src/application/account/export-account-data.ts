import { AuthTokenError } from '../../domain/auth/auth-token-error.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import type { AccessTokenService } from '../ports/access-token-service.js';
import type { AccountRepository } from '../ports/account-repository.js';
import type { DeviceRepository } from '../ports/device-repository.js';
import type { FavoriteSyncRepository } from '../ports/favorite-sync-repository.js';
import type { PlaybackSyncRepository } from '../ports/playback-sync-repository.js';
import type { ProfileRepository } from '../ports/profile-repository.js';
import type { SourceRepository } from '../ports/source-repository.js';
import {
  toAccountDataExport,
  type AccountDataExport,
} from './account-export-public-view.js';

export type ExportAccountDataInput = {
  readonly accessToken: string;
};

/**
 * GET /account/export — privacy-safe dump of account-owned data (BE-013 / NFR-006).
 * Omits password hashes, tokens, push tokens, and source credential ciphertext.
 */
export class ExportAccountData {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly accounts: AccountRepository,
    private readonly profiles: ProfileRepository,
    private readonly devices: DeviceRepository,
    private readonly sources: SourceRepository,
    private readonly favorites: FavoriteSyncRepository,
    private readonly playback: PlaybackSyncRepository,
  ) {}

  async execute(input: ExportAccountDataInput): Promise<AccountDataExport> {
    const clear = input.accessToken.trim();
    if (clear === '') {
      throw new DomainError('accessToken is required', 'AUTH_INPUT_INVALID');
    }

    let accountId: string;
    try {
      accountId = this.accessTokens.verify(clear).accountId;
    } catch (error: unknown) {
      if (error instanceof AuthTokenError) {
        throw new DomainError(error.message, 'AUTH_ACCESS_INVALID');
      }
      throw new DomainError('Invalid access token', 'AUTH_ACCESS_INVALID');
    }

    const account = await this.accounts.findById(accountId);
    if (account === null) {
      throw new DomainError('Account not found', 'AUTH_ACCOUNT_NOT_FOUND');
    }

    const [profiles, devices, sources, favorites, playbackStates] =
      await Promise.all([
        this.profiles.listByAccount(accountId),
        this.devices.listAllByAccount(accountId),
        this.sources.listAllByAccount(accountId),
        this.favorites.listFavoritesByAccount(accountId),
        this.playback.listPlaybackByAccount(accountId),
      ]);

    return toAccountDataExport({
      account,
      profiles,
      devices,
      sources,
      favorites,
      playbackStates,
    });
  }
}
