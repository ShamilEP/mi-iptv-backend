import type {
  ApplySettingsWriteInput,
  ApplySettingsWriteResult,
  SettingsSyncRepository,
} from '../../application/ports/settings-sync-repository.js';
import type { SyncLogRepository } from '../../application/ports/sync-log-repository.js';
import type { ProfileSettings } from '../../domain/sync/profile-settings.js';
import type { SyncLog } from '../../domain/sync/sync-log.js';
import { InMemorySyncLogRepository } from './in-memory-sync-log-repository.js';

/**
 * Sprint 0 in-memory profile settings + SyncLog for BE-106.
 * Replace with a Postgres adapter over `app.profile_settings`.
 */
export class InMemorySettingsSyncRepository implements SettingsSyncRepository {
  private readonly byProfile = new Map<string, ProfileSettings>();
  private readonly changeSeqByAccount = new Map<string, number>();
  private readonly syncLog: SyncLogRepository;

  constructor(syncLog: SyncLogRepository = new InMemorySyncLogRepository()) {
    this.syncLog = syncLog;
  }

  async findSyncEvent(
    accountId: string,
    clientEventId: string,
  ): Promise<SyncLog | null> {
    return this.syncLog.findByClientEventId(accountId, clientEventId);
  }

  async findByProfile(
    accountId: string,
    profileId: string,
  ): Promise<ProfileSettings | null> {
    const row = this.byProfile.get(profileId);
    if (!row || row.accountId !== accountId) {
      return null;
    }
    return row;
  }

  async listByAccount(accountId: string): Promise<readonly ProfileSettings[]> {
    return [...this.byProfile.values()]
      .filter((row) => row.accountId === accountId)
      .sort((a, b) => a.profileId.localeCompare(b.profileId));
  }

  async applySettingsWrite(
    input: ApplySettingsWriteInput,
  ): Promise<ApplySettingsWriteResult> {
    const changeSeq = nextChangeSeq(this.changeSeqByAccount, input.accountId);
    const existing = await this.findByProfile(
      input.accountId,
      input.profileId,
    );

    const settings: ProfileSettings =
      existing === null
        ? {
            profileId: input.profileId,
            accountId: input.accountId,
            payload: { ...input.payload },
            syncVersion: input.resultVersion,
            changeSeq,
            deletedAt: null,
            createdAt: input.serverNow,
            updatedAt: input.serverNow,
          }
        : {
            ...existing,
            payload: { ...input.payload },
            syncVersion: input.resultVersion,
            changeSeq,
            deletedAt: null,
            updatedAt: input.serverNow,
          };

    this.byProfile.set(input.profileId, settings);

    const syncLog = await this.syncLog.append({
      accountId: input.accountId,
      clientEventId: input.clientEventId,
      deviceId: input.deviceId,
      entity: 'setting',
      entityId: input.profileId,
      operation: input.operation,
      accepted: true,
      resolvedBy: input.resolvedBy,
      resultVersion: input.resultVersion,
      changeSeq,
      clientReportedAt: input.clientReportedAt,
      createdAt: input.serverNow,
    });

    return { settings, changeSeq, syncLog };
  }

  async deleteByProfile(accountId: string, profileId: string): Promise<number> {
    const row = this.byProfile.get(profileId);
    if (!row || row.accountId !== accountId) {
      return 0;
    }
    this.byProfile.delete(profileId);
    return 1;
  }

  async deleteByAccount(accountId: string): Promise<number> {
    let count = 0;
    for (const [id, row] of this.byProfile) {
      if (row.accountId !== accountId) {
        continue;
      }
      this.byProfile.delete(id);
      count += 1;
    }
    return count;
  }
}

function nextChangeSeq(
  map: Map<string, number>,
  accountId: string,
): number {
  const next = (map.get(accountId) ?? 0) + 1;
  map.set(accountId, next);
  return next;
}
