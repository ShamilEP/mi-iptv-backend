import type { AccountSyncClock } from '../../application/ports/account-sync-clock.js';
import type {
  ApplyFavoriteWriteInput,
  ApplyFavoriteWriteResult,
  FavoriteSyncRepository,
} from '../../application/ports/favorite-sync-repository.js';
import type { SyncLogRepository } from '../../application/ports/sync-log-repository.js';
import type { Favorite, FavoriteType } from '../../domain/sync/favorite.js';
import type { SyncLog } from '../../domain/sync/sync-log.js';
import { InMemorySyncLogRepository } from './in-memory-sync-log-repository.js';

/**
 * Sprint 0 in-memory favorites + SyncLog store for BE-063 / BE-065.
 * Prefer a shared `AccountSyncClock` so GET /sync/state can merge entity streams.
 */
export class InMemoryFavoriteSyncRepository implements FavoriteSyncRepository {
  private readonly favorites = new Map<string, Favorite>();
  private readonly changeSeqByAccount = new Map<string, number>();
  private readonly syncLog: SyncLogRepository;
  private readonly clock: AccountSyncClock | null;

  constructor(
    syncLog: SyncLogRepository = new InMemorySyncLogRepository(),
    clock: AccountSyncClock | null = null,
  ) {
    this.syncLog = syncLog;
    this.clock = clock;
  }

  async findSyncEvent(
    accountId: string,
    clientEventId: string,
  ): Promise<SyncLog | null> {
    return this.syncLog.findByClientEventId(accountId, clientEventId);
  }

  async findFavorite(
    accountId: string,
    profileId: string,
    itemId: string,
  ): Promise<Favorite | null> {
    const row = this.favorites.get(favoriteKey(profileId, itemId));
    if (!row || row.accountId !== accountId) {
      return null;
    }
    return row;
  }

  async listFavorites(
    accountId: string,
    profileId: string,
  ): Promise<readonly Favorite[]> {
    return [...this.favorites.values()]
      .filter(
        (row) =>
          row.accountId === accountId &&
          row.profileId === profileId &&
          row.deletedAt === null,
      )
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      );
  }

  async listFavoritesByAccount(
    accountId: string,
  ): Promise<readonly Favorite[]> {
    return [...this.favorites.values()]
      .filter((row) => row.accountId === accountId)
      .sort(
        (a, b) =>
          a.profileId.localeCompare(b.profileId) ||
          a.sortOrder - b.sortOrder ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      );
  }

  async applyFavoriteWrite(
    input: ApplyFavoriteWriteInput,
  ): Promise<ApplyFavoriteWriteResult> {
    const changeSeq = await this.allocateChangeSeq(input.accountId);
    const existing = await this.findFavorite(
      input.accountId,
      input.profileId,
      input.itemId,
    );
    const deletedAt = input.action === 'add' ? null : input.serverNow;
    const sortOrder =
      input.sortOrder !== null
        ? input.sortOrder
        : (existing?.sortOrder ?? 0);
    const type: FavoriteType = input.type ?? existing?.type ?? 'vod';

    let favorite: Favorite;
    if (existing === null) {
      favorite = {
        profileId: input.profileId,
        accountId: input.accountId,
        itemId: input.itemId,
        type,
        sortOrder,
        syncVersion: input.resultVersion,
        changeSeq,
        deletedAt,
        createdAt: input.serverNow,
        updatedAt: input.serverNow,
      };
    } else {
      favorite = {
        ...existing,
        type: input.type ?? existing.type,
        sortOrder,
        syncVersion: input.resultVersion,
        changeSeq,
        deletedAt,
        updatedAt: input.serverNow,
      };
    }
    this.favorites.set(favoriteKey(input.profileId, input.itemId), favorite);

    const syncLog = await this.syncLog.append({
      accountId: input.accountId,
      clientEventId: input.clientEventId,
      deviceId: input.deviceId,
      entity: 'favorite',
      entityId: `${input.profileId}:${input.itemId}`,
      operation: input.operation,
      accepted: true,
      resolvedBy: input.resolvedBy,
      resultVersion: input.resultVersion,
      changeSeq,
      clientReportedAt: input.clientReportedAt,
      createdAt: input.serverNow,
    });

    return { favorite, changeSeq, syncLog };
  }

  async deleteByProfile(
    accountId: string,
    profileId: string,
  ): Promise<number> {
    let count = 0;
    for (const [key, row] of this.favorites) {
      if (row.accountId !== accountId || row.profileId !== profileId) {
        continue;
      }
      this.favorites.delete(key);
      count += 1;
    }
    return count;
  }

  async deleteByAccount(accountId: string): Promise<number> {
    let count = 0;
    for (const [key, row] of this.favorites) {
      if (row.accountId !== accountId) {
        continue;
      }
      this.favorites.delete(key);
      count += 1;
    }
    this.changeSeqByAccount.delete(accountId);
    return count;
  }

  private async allocateChangeSeq(accountId: string): Promise<number> {
    if (this.clock !== null) {
      return this.clock.nextChangeSeq(accountId);
    }
    const next = (this.changeSeqByAccount.get(accountId) ?? 0) + 1;
    this.changeSeqByAccount.set(accountId, next);
    return next;
  }
}

function favoriteKey(profileId: string, itemId: string): string {
  return `${profileId}:${itemId}`;
}
