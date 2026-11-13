import { DomainError } from '../../domain/shared/domain-error.js';
import type { FavoriteSyncRepository } from '../ports/favorite-sync-repository.js';
import type { ProfileRepository } from '../ports/profile-repository.js';
import { requireOwnedProfile } from '../profiles/require-owned-profile.js';
import {
  toFavoritePublicView,
  type FavoritePublicView,
} from './favorite-public-view.js';

/**
 * GET /api/v1/sync/favorites — active favorites for the profile (BE-063 / BE-036).
 */
export class ListFavorites {
  constructor(
    private readonly repository: FavoriteSyncRepository,
    private readonly profiles: ProfileRepository,
  ) {}

  async execute(
    accountId: string,
    profileId: string,
  ): Promise<readonly FavoritePublicView[]> {
    assertNonEmpty(accountId, 'accountId');
    assertNonEmpty(profileId, 'profileId');
    await requireOwnedProfile(this.profiles, accountId, profileId);
    const rows = await this.repository.listFavorites(accountId, profileId);
    return rows.map(toFavoritePublicView);
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new DomainError(`${field} is required`, 'SYNC_CONTEXT_INVALID');
  }
}
