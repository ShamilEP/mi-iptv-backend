import type { Favorite, FavoriteType } from '../../domain/sync/favorite.js';
import type { SyncLog } from '../../domain/sync/sync-log.js';
import type { SyncOperation, SyncResolvedBy } from '../../domain/sync/sync-types.js';

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
  readonly syncLog: SyncLog;
};

/**
 * Persistence for favorites list/write + SyncLog ledger (BE-063 / BE-065).
 * Postgres can later wrap `app.set_favorite`.
 */
export interface FavoriteSyncRepository {
  findSyncEvent(
    accountId: string,
    clientEventId: string,
  ): Promise<SyncLog | null>;

  findFavorite(
    accountId: string,
    profileId: string,
    itemId: string,
  ): Promise<Favorite | null>;

  listFavorites(
    accountId: string,
    profileId: string,
  ): Promise<readonly Favorite[]>;

  /** All favorites for the account (export / cascade). */
  listFavoritesByAccount(accountId: string): Promise<readonly Favorite[]>;

  applyFavoriteWrite(
    input: ApplyFavoriteWriteInput,
  ): Promise<ApplyFavoriteWriteResult>;

  /** Hard-delete favorites for one profile (BE-036 cascade). */
  deleteByProfile(accountId: string, profileId: string): Promise<number>;

  /** Hard-delete every favorite row for the account. */
  deleteByAccount(accountId: string): Promise<number>;
}
