import { DomainError } from '../../domain/shared/domain-error.js';
import { parseClientEventId } from '../../domain/sync/client-event-id.js';
import { decideSettingsWrite } from '../../domain/sync/decide-settings-write.js';
import {
  filterSyncableSettings,
  mergeSettingsPayload,
} from '../../domain/sync/profile-settings.js';
import {
  buildSyncConflictReport,
  type SyncConflictReport,
} from '../../domain/sync/sync-log.js';
import type { SyncResolvedBy } from '../../domain/sync/sync-types.js';
import type { ProfileRepository } from '../ports/profile-repository.js';
import type { SettingsSyncRepository } from '../ports/settings-sync-repository.js';
import { requireOwnedProfile } from '../profiles/require-owned-profile.js';
import {
  toProfileSettingsPublicView,
  type ProfileSettingsPublicView,
} from './settings-public-view.js';

export type UpsertProfileSettingsInput = {
  readonly accountId: string;
  readonly profileId: string;
  readonly deviceId: string;
  readonly clientEventId: string;
  readonly syncVersion: number;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly clientReportedAt?: Date | null;
};

export type UpsertProfileSettingsResult = {
  readonly status: 'OK';
  readonly accepted: boolean;
  readonly currentVersion: number;
  readonly serverTimestamp: Date;
  readonly resolvedBy: SyncResolvedBy;
  readonly changeSeq: number | null;
  readonly conflict: SyncConflictReport | null;
  readonly settings: ProfileSettingsPublicView;
};

/**
 * POST /api/v1/sync/settings — syncable settings upsert (BE-106 / SRS §7).
 */
export class UpsertProfileSettings {
  constructor(
    private readonly repository: SettingsSyncRepository,
    private readonly profiles: ProfileRepository,
  ) {}

  async execute(
    input: UpsertProfileSettingsInput,
  ): Promise<UpsertProfileSettingsResult> {
    assertNonEmpty(input.accountId, 'accountId');
    assertNonEmpty(input.profileId, 'profileId');
    assertNonEmpty(input.deviceId, 'deviceId');
    await requireOwnedProfile(
      this.profiles,
      input.accountId,
      input.profileId,
    );

    if (
      input.payload === null ||
      typeof input.payload !== 'object' ||
      Array.isArray(input.payload)
    ) {
      throw new DomainError(
        'payload must be a JSON object',
        'SETTINGS_PAYLOAD_INVALID',
      );
    }

    const syncablePatch = filterSyncableSettings(input.payload);
    const clientEventId = parseClientEventId(input.clientEventId);
    const serverNow = new Date();
    const priorEvent = await this.repository.findSyncEvent(
      input.accountId,
      clientEventId,
    );
    const existing = await this.repository.findByProfile(
      input.accountId,
      input.profileId,
    );

    const decision = decideSettingsWrite({
      clientEventId,
      priorEvent,
      existing:
        existing === null || existing.deletedAt !== null
          ? null
          : { syncVersion: existing.syncVersion },
      write: { baseVersion: input.syncVersion },
    });

    if (decision.isReplay && priorEvent !== null) {
      const current =
        existing !== null && existing.deletedAt === null
          ? toProfileSettingsPublicView(existing)
          : {
              profileId: input.profileId,
              payload: {},
              syncVersion: decision.resultVersion,
              changeSeq: priorEvent.changeSeq ?? 0,
              updatedAt: serverNow.toISOString(),
            };
      return {
        status: 'OK',
        accepted: decision.accepted,
        currentVersion: decision.resultVersion,
        serverTimestamp: serverNow,
        resolvedBy: decision.resolvedBy,
        changeSeq: priorEvent.changeSeq,
        conflict: buildSyncConflictReport(
          priorEvent.entity,
          priorEvent.operation,
          priorEvent.resolvedBy,
        ),
        settings: current,
      };
    }

    const merged = mergeSettingsPayload(
      existing?.payload ?? {},
      syncablePatch,
    );

    const applied = await this.repository.applySettingsWrite({
      accountId: input.accountId,
      profileId: input.profileId,
      deviceId: input.deviceId,
      clientEventId,
      payload: merged,
      clientReportedAt: input.clientReportedAt ?? null,
      resolvedBy: decision.resolvedBy,
      operation: decision.operation,
      resultVersion: decision.resultVersion,
      serverNow,
    });

    return {
      status: 'OK',
      accepted: true,
      currentVersion: decision.resultVersion,
      serverTimestamp: serverNow,
      resolvedBy: decision.resolvedBy,
      changeSeq: applied.changeSeq,
      conflict: buildSyncConflictReport(
        applied.syncLog.entity,
        applied.syncLog.operation,
        applied.syncLog.resolvedBy,
      ),
      settings: toProfileSettingsPublicView(applied.settings),
    };
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new DomainError(`${field} is required`, 'SYNC_CONTEXT_INVALID');
  }
}
