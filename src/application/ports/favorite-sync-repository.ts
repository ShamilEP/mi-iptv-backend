import type { Favorite, FavoriteType } from '../../domain/sync/favorite.js';
import type {
  RecordedSyncEvent,
  SyncOperation,
  SyncResolvedBy,
} from '../../domain/sync/sync-types.js';

export type FavoriteSyncEvent = RecordedSyncEvent & {
  readonly accountId: string;
  readonly clientEventId: string;
  readonly deviceId: string | null;
  readonly entityId: string;
  readonly operation: SyncOperation;
  readonly clientReportedAt: Date | null;
  readonly createdAt: Date;
};

export type ApplyFavoriteWriteInput = {
  readonly accountId: string;
  readonly profileId: string;
  readonly deviceId: string;
  readonly clientEventId: string;
  readonly itemId: string;
  readonly action: 'add' | 'remove';
  readonly type: FavoriteType | null;
  readonly sortOrder: number | null;
  readonly clientReportedAt: Date | null;
  readonly resolvedBy: SyncResolvedBy;
  readonly operation: SyncOperation;
  readonly resultVersion: number;
  readonly serverNow: Date;
};

export type ApplyFavoriteWriteResult = {
  readonly favorite: Favorite;
  readonly changeSeq: number;
  readonly syncEvent: FavoriteSyncEvent;
};

/**
 * Persistence for favorites list/write + sync_events ledger (BE-063).
 * Postgres can later wrap `app.set_favorite`.
 */
export interface FavoriteSyncRepository {
  findSyncEvent(
    accountId: string,
    clientEventId: string,
  ): Promise<FavoriteSyncEvent | null>;

  findFavorite(
    accountId: string,
    profileId: string,
    itemId: string,
  ): Promise<Favorite | null>;

  listFavorites(
    accountId: string,
    profileId: string,
  ): Promise<readonly Favorite[]>;

  applyFavoriteWrite(
    input: ApplyFavoriteWriteInput,
  ): Promise<ApplyFavoriteWriteResult>;
}
