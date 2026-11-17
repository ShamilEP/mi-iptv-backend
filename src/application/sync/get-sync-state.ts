import {
  serverNowUtc,
  toServerTimestamp,
} from '../../domain/api/server-clock.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import type { SyncDeltaChange, SyncStatePage } from '../../domain/sync/sync-delta.js';
import type { AccountSyncClock } from '../ports/account-sync-clock.js';
import type { FavoriteSyncRepository } from '../ports/favorite-sync-repository.js';
import type { PlaybackSyncRepository } from '../ports/playback-sync-repository.js';
import type { SourceRepository } from '../ports/source-repository.js';
import {
  toFavoriteDelta,
  toPlaybackStateDelta,
  toSourceDelta,
} from './sync-delta-public-view.js';
import { parseSyncStateQuery } from './parse-sync-state-query.js';

export type GetSyncStateInput = {
  readonly accountId: string;
  readonly cursor?: unknown;
  readonly since?: unknown;
  readonly limit?: unknown;
};

/**
 * GET /api/v1/sync/state — playback + favorites + sources deltas (BE-062).
 */
export class GetSyncState {
  constructor(
    private readonly clock: AccountSyncClock,
    private readonly playback: PlaybackSyncRepository,
    private readonly favorites: FavoriteSyncRepository,
    private readonly sources: SourceRepository,
  ) {}

  async execute(input: GetSyncStateInput): Promise<SyncStatePage> {
    const accountId = input.accountId.trim();
    if (accountId === '') {
      throw new DomainError('accountId is required', 'SYNC_ACCOUNT_REQUIRED');
    }

    const { cursor, limit } = parseSyncStateQuery({
      cursor: input.cursor,
      since: input.since,
      limit: input.limit,
    });

    const tombstoneFloor = await this.clock.getTombstoneFloor(accountId);
    if (cursor < tombstoneFloor) {
      throw new DomainError(
        'Cursor is behind the tombstone floor — full resync required',
        'SYNC_FULL_RESYNC_REQUIRED',
      );
    }

    const changes = await this.collectChanges(accountId, cursor);
    const page = changes.slice(0, limit);
    const truncated = changes.length > limit;
    const nextCursor =
      page.length > 0 ? page[page.length - 1]!.seq : cursor;

    return {
      changes: page,
      nextCursor,
      serverTimestamp: toServerTimestamp(serverNowUtc()),
      truncated,
    };
  }

  private async collectChanges(
    accountId: string,
    cursor: number,
  ): Promise<SyncDeltaChange[]> {
    const [playbackRows, favoriteRows, sourceRows] = await Promise.all([
      this.playback.listPlaybackByAccount(accountId),
      this.favorites.listFavoritesByAccount(accountId),
      this.sources.listAllByAccount(accountId),
    ]);

    const merged: SyncDeltaChange[] = [
      ...playbackRows
        .filter((row) => row.changeSeq > cursor)
        .map(toPlaybackStateDelta),
      ...favoriteRows
        .filter((row) => row.changeSeq > cursor)
        .map(toFavoriteDelta),
      ...sourceRows
        .filter((row) => row.changeSeq > cursor)
        .map(toSourceDelta),
    ];

    merged.sort((a, b) => a.seq - b.seq || a.entity.localeCompare(b.entity));
    return merged;
  }
}
