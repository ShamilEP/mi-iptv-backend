import { DomainError } from '../../domain/shared/domain-error.js';
import { parseClientEventId } from '../../domain/sync/client-event-id.js';
import { decidePlaybackWrite } from '../../domain/sync/decide-playback-write.js';
import {
  buildSyncConflictReport,
  type SyncConflictReport,
} from '../../domain/sync/sync-log.js';
import type { SyncResolvedBy } from '../../domain/sync/sync-types.js';
import type { PlaybackSyncRepository } from '../ports/playback-sync-repository.js';

export type UpsertPlaybackStateInput = {
  readonly accountId: string;
  readonly profileId: string;
  readonly deviceId: string;
  readonly clientEventId: string;
  readonly contentId: string;
  readonly position: number;
  readonly completed: boolean;
  readonly syncVersion: number;
  readonly duration?: number | null;
  readonly sourceId?: string | null;
  readonly forceReset?: boolean;
  readonly clientReportedAt?: Date | null;
};

export type UpsertPlaybackStateResult = {
  readonly status: 'OK';
  readonly accepted: boolean;
  readonly currentVersion: number;
  readonly serverTimestamp: Date;
  readonly resolvedBy: SyncResolvedBy;
  readonly changeSeq: number | null;
  readonly conflict: SyncConflictReport | null;
};

/**
 * POST /api/v1/sync/playback-state (BE-061 / BE-065 / Backend §3.1 / ADR-005).
 */
export class UpsertPlaybackState {
  constructor(private readonly repository: PlaybackSyncRepository) {}

  async execute(
    input: UpsertPlaybackStateInput,
  ): Promise<UpsertPlaybackStateResult> {
    assertNonEmpty(input.accountId, 'accountId');
    assertNonEmpty(input.profileId, 'profileId');
    assertNonEmpty(input.deviceId, 'deviceId');
    assertNonEmpty(input.contentId, 'contentId');

    const clientEventId = parseClientEventId(input.clientEventId);
    const serverNow = new Date();
    const priorEvent = await this.repository.findSyncEvent(
      input.accountId,
      clientEventId,
    );
    const existing = await this.repository.findPlaybackState(
      input.accountId,
      input.profileId,
      input.contentId,
    );

    const decision = decidePlaybackWrite({
      clientEventId,
      priorEvent,
      existing:
        existing === null
          ? null
          : {
              syncVersion: existing.syncVersion,
              positionSec: existing.positionSec,
              updatedAt: existing.updatedAt,
              lastDeviceId: existing.lastDeviceId,
            },
      write: {
        deviceId: input.deviceId,
        positionSec: input.position,
        durationSec: input.duration ?? null,
        completed: input.completed,
        baseVersion: input.syncVersion,
        forceReset: input.forceReset === true,
        serverNow,
      },
    });

    if (decision.isReplay && priorEvent !== null) {
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
      };
    }

    const applied = await this.repository.applyPlaybackWrite({
      accountId: input.accountId,
      profileId: input.profileId,
      deviceId: input.deviceId,
      clientEventId,
      contentId: input.contentId,
      sourceId: input.sourceId ?? null,
      positionSec: input.position,
      durationSec: input.duration ?? null,
      completed: input.completed,
      clientReportedAt: input.clientReportedAt ?? null,
      accepted: decision.accepted,
      resolvedBy: decision.resolvedBy,
      operation: decision.operation,
      resultVersion: decision.resultVersion,
      serverNow,
    });

    return {
      status: 'OK',
      accepted: decision.accepted,
      currentVersion: decision.resultVersion,
      serverTimestamp: serverNow,
      resolvedBy: decision.resolvedBy,
      changeSeq: applied.changeSeq,
      conflict: buildSyncConflictReport(
        applied.syncLog.entity,
        applied.syncLog.operation,
        applied.syncLog.resolvedBy,
      ),
    };
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new DomainError(`${field} is required`, 'SYNC_CONTEXT_INVALID');
  }
}
