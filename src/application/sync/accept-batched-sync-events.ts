import { DomainError } from '../../domain/shared/domain-error.js';
import {
  assertSyncBatchSize,
  type BatchedSyncEntity,
} from '../../domain/sync/sync-batch.js';
import type { SyncConflictReport } from '../../domain/sync/sync-log.js';
import type { SyncResolvedBy } from '../../domain/sync/sync-types.js';
import type { SetFavorite, SetFavoriteInput } from './set-favorite.js';
import type {
  UpsertPlaybackState,
  UpsertPlaybackStateInput,
} from './upsert-playback-state.js';

type PlaybackBatchEvent = {
  readonly entity: 'playback_state';
} & Omit<
  UpsertPlaybackStateInput,
  'accountId' | 'profileId' | 'deviceId'
>;

type FavoriteBatchEvent = {
  readonly entity: 'favorite';
} & Omit<SetFavoriteInput, 'accountId' | 'profileId' | 'deviceId'>;

export type BatchedSyncEventInput = PlaybackBatchEvent | FavoriteBatchEvent;

export type AcceptBatchedSyncEventsInput = {
  readonly accountId: string;
  readonly profileId: string;
  readonly deviceId: string;
  readonly events: readonly BatchedSyncEventInput[];
};

export type BatchedSyncEventResult = {
  readonly entity: BatchedSyncEntity;
  readonly clientEventId: string;
  readonly accepted: boolean;
  readonly currentVersion: number;
  readonly serverTimestamp: Date;
  readonly resolvedBy: SyncResolvedBy;
  readonly changeSeq: number | null;
  readonly conflict: SyncConflictReport | null;
};

export type AcceptBatchedSyncEventsResult = {
  readonly status: 'OK';
  readonly results: readonly BatchedSyncEventResult[];
};

/**
 * POST /api/v1/sync/events — drain offline outbox batches (BE-067 / SRS §7).
 * Reuses single-write use cases so per-event clientEventId idempotency is unchanged.
 */
export class AcceptBatchedSyncEvents {
  constructor(
    private readonly upsertPlaybackState: UpsertPlaybackState,
    private readonly setFavorite: SetFavorite,
  ) {}

  async execute(
    input: AcceptBatchedSyncEventsInput,
  ): Promise<AcceptBatchedSyncEventsResult> {
    assertNonEmpty(input.accountId, 'accountId');
    assertNonEmpty(input.profileId, 'profileId');
    assertNonEmpty(input.deviceId, 'deviceId');
    assertSyncBatchSize(input.events.length);

    const results: BatchedSyncEventResult[] = [];
    for (const event of input.events) {
      results.push(await this.applyEvent(input, event));
    }

    return { status: 'OK', results };
  }

  private async applyEvent(
    context: Pick<
      AcceptBatchedSyncEventsInput,
      'accountId' | 'profileId' | 'deviceId'
    >,
    event: BatchedSyncEventInput,
  ): Promise<BatchedSyncEventResult> {
    if (event.entity === 'playback_state') {
      const result = await this.upsertPlaybackState.execute({
        accountId: context.accountId,
        profileId: context.profileId,
        deviceId: context.deviceId,
        clientEventId: event.clientEventId,
        contentId: event.contentId,
        position: event.position,
        completed: event.completed,
        syncVersion: event.syncVersion,
        ...(event.duration !== undefined ? { duration: event.duration } : {}),
        ...(event.sourceId !== undefined ? { sourceId: event.sourceId } : {}),
        ...(event.forceReset !== undefined
          ? { forceReset: event.forceReset }
          : {}),
        ...(event.clientReportedAt !== undefined
          ? { clientReportedAt: event.clientReportedAt }
          : {}),
      });
      return {
        entity: 'playback_state',
        clientEventId: event.clientEventId,
        accepted: result.accepted,
        currentVersion: result.currentVersion,
        serverTimestamp: result.serverTimestamp,
        resolvedBy: result.resolvedBy,
        changeSeq: result.changeSeq,
        conflict: result.conflict,
      };
    }

    if (event.entity === 'favorite') {
      const result = await this.setFavorite.execute({
        accountId: context.accountId,
        profileId: context.profileId,
        deviceId: context.deviceId,
        clientEventId: event.clientEventId,
        itemId: event.itemId,
        action: event.action,
        syncVersion: event.syncVersion,
        ...(event.type !== undefined ? { type: event.type } : {}),
        ...(event.sortOrder !== undefined ? { sortOrder: event.sortOrder } : {}),
        ...(event.clientReportedAt !== undefined
          ? { clientReportedAt: event.clientReportedAt }
          : {}),
      });
      return {
        entity: 'favorite',
        clientEventId: event.clientEventId,
        accepted: result.accepted,
        currentVersion: result.currentVersion,
        serverTimestamp: result.serverTimestamp,
        resolvedBy: result.resolvedBy,
        changeSeq: result.changeSeq,
        conflict: result.conflict,
      };
    }

    throw new DomainError(
      'entity must be playback_state or favorite',
      'SYNC_BATCH_ENTITY_INVALID',
    );
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new DomainError(`${field} is required`, 'SYNC_CONTEXT_INVALID');
  }
}
