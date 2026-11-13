import { DomainError } from '../../domain/shared/domain-error.js';
import type { AccessTokenService } from '../ports/access-token-service.js';
import type { FavoriteSyncRepository } from '../ports/favorite-sync-repository.js';
import type { PlaybackSyncRepository } from '../ports/playback-sync-repository.js';
import type { ProfileRepository } from '../ports/profile-repository.js';
import { requireOwnedProfile } from './require-owned-profile.js';
import { verifyProfileAccessAccountId } from './verify-profile-access-token.js';

export type DeleteProfileInput = {
  readonly accessToken: string;
  readonly profileId: string;
};

export type DeleteProfileResult = {
  readonly deleted: true;
  readonly profileId: string;
};

/**
 * DELETE /profiles/{id} — remove a profile and its scoped sync data (BE-036).
 * Refuses deleting the last remaining profile.
 */
export class DeleteProfile {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly profiles: ProfileRepository,
    private readonly favorites: FavoriteSyncRepository,
    private readonly playback: PlaybackSyncRepository,
  ) {}

  async execute(input: DeleteProfileInput): Promise<DeleteProfileResult> {
    const accountId = verifyProfileAccessAccountId(
      this.accessTokens,
      input.accessToken,
    );
    const profile = await requireOwnedProfile(
      this.profiles,
      accountId,
      input.profileId,
    );

    const siblings = await this.profiles.listByAccount(accountId);
    if (siblings.length <= 1) {
      throw new DomainError(
        'Cannot delete the last profile on the account',
        'PROFILE_LAST_REMAINING',
      );
    }

    await this.favorites.deleteByProfile(accountId, profile.id);
    await this.playback.deleteByProfile(accountId, profile.id);

    const removed = await this.profiles.deleteById(accountId, profile.id);
    if (!removed) {
      throw new DomainError('Profile not found', 'PROFILE_NOT_FOUND');
    }

    if (profile.isDefault) {
      const remaining = await this.profiles.listByAccount(accountId);
      const next = remaining[0];
      if (next !== undefined && !next.isDefault) {
        await this.profiles.save({
          ...next,
          isDefault: true,
          updatedAt: new Date(),
        });
      }
    }

    return { deleted: true, profileId: profile.id };
  }
}
