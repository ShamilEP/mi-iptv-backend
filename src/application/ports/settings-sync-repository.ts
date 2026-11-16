import type { ProfileSettings } from '../../domain/sync/profile-settings.js';
import type { SyncLog } from '../../domain/sync/sync-log.js';
import type { SyncOperation, SyncResolvedBy } from '../../domain/sync/sync-types.js';

export type ApplySettingsWriteInput = {
  readonly accountId: string;
  readonly profileId: string;
  readonly deviceId: string;
  readonly clientEventId: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly clientReportedAt: Date | null;
  readonly resolvedBy: SyncResolvedBy;
  readonly operation: SyncOperation;
  readonly resultVersion: number;
  readonly serverNow: Date;
};

export type ApplySettingsWriteResult = {
  readonly settings: ProfileSettings;
  readonly changeSeq: number;
  readonly syncLog: SyncLog;
};

/**
 * Persistence for profile settings sync + SyncLog (BE-106).
 * Postgres can later wrap `app.profile_settings` + `sync_events`.
 */
export interface SettingsSyncRepository {
  findSyncEvent(
    accountId: string,
    clientEventId: string,
  ): Promise<SyncLog | null>;

  findByProfile(
    accountId: string,
    profileId: string,
  ): Promise<ProfileSettings | null>;

  listByAccount(accountId: string): Promise<readonly ProfileSettings[]>;

  applySettingsWrite(
    input: ApplySettingsWriteInput,
  ): Promise<ApplySettingsWriteResult>;

  deleteByProfile(accountId: string, profileId: string): Promise<number>;

  deleteByAccount(accountId: string): Promise<number>;
}
