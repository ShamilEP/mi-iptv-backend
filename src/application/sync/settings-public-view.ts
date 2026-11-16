import {
  filterSyncableSettings,
  type ProfileSettings,
} from '../../domain/sync/profile-settings.js';

export type ProfileSettingsPublicView = {
  readonly profileId: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly syncVersion: number;
  readonly changeSeq: number;
  readonly updatedAt: string;
};

export function toProfileSettingsPublicView(
  row: ProfileSettings,
): ProfileSettingsPublicView {
  return {
    profileId: row.profileId,
    payload: filterSyncableSettings(row.payload),
    syncVersion: row.syncVersion,
    changeSeq: row.changeSeq,
    updatedAt: row.updatedAt.toISOString(),
  };
}
