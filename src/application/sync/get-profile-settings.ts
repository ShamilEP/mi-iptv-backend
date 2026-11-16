import { DomainError } from '../../domain/shared/domain-error.js';
import type { ProfileRepository } from '../ports/profile-repository.js';
import type { SettingsSyncRepository } from '../ports/settings-sync-repository.js';
import { requireOwnedProfile } from '../profiles/require-owned-profile.js';
import {
  toProfileSettingsPublicView,
  type ProfileSettingsPublicView,
} from './settings-public-view.js';

/**
 * GET /api/v1/sync/settings — syncable settings for one profile (BE-106).
 */
export class GetProfileSettings {
  constructor(
    private readonly settings: SettingsSyncRepository,
    private readonly profiles: ProfileRepository,
  ) {}

  async execute(
    accountId: string,
    profileId: string,
  ): Promise<ProfileSettingsPublicView> {
    assertNonEmpty(accountId, 'accountId');
    assertNonEmpty(profileId, 'profileId');
    await requireOwnedProfile(this.profiles, accountId, profileId);

    const row = await this.settings.findByProfile(accountId, profileId);
    if (row === null || row.deletedAt !== null) {
      return {
        profileId,
        payload: {},
        syncVersion: 0,
        changeSeq: 0,
        updatedAt: new Date(0).toISOString(),
      };
    }
    return toProfileSettingsPublicView(row);
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new DomainError(`${field} is required`, 'SYNC_CONTEXT_INVALID');
  }
}
