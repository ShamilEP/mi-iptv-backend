import type {
  ApplyFavoriteWriteInput,
  ApplyFavoriteWriteResult,
  FavoriteSyncEvent,
  FavoriteSyncRepository,
} from '../../application/ports/favorite-sync-repository.js';
import type { Favorite, FavoriteType } from '../../domain/sync/favorite.js';

/**
 * Sprint 0 in-memory favorites + sync_events store for BE-063.
 * Replace with a Postgres adapter wrapping `app.set_favorite`.
 */
export class InMemoryFavoriteSyncRepository implements FavoriteSyncRepository {
  private readonly events = new Map<string, FavoriteSyncEvent>();
  private readonly favorites = new Map<string, Favorite>();
  private readonly changeSeqByAccount = new Map<string, number>();

  async findSyncEvent(
    accountId: string,
    clientEventId: string,
  ): Promise<FavoriteSyncEvent | null> {
    return this.events.get(eventKey(accountId, clientEventId)) ?? null;
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

  async applyFavoriteWrite(
    input: ApplyFavoriteWriteInput,
  ): Promise<ApplyFavoriteWriteResult> {
    const key = eventKey(input.accountId, input.clientEventId);
    if (this.events.has(key)) {
      throw new Error('Duplicate clientEventId write without replay path');
    }

    const changeSeq = nextChangeSeq(this.changeSeqByAccount, input.accountId);
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
    const type: FavoriteType =
      input.type ?? existing?.type ?? 'vod';

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

    const syncEvent: FavoriteSyncEvent = {
      accountId: input.accountId,
      clientEventId: input.clientEventId,
      deviceId: input.deviceId,
      entityId: `${input.profileId}:${input.itemId}`,
      operation: input.operation,
      accepted: true,
      resolvedBy: input.resolvedBy,
      resultVersion: input.resultVersion,
      changeSeq,
      clientReportedAt: input.clientReportedAt,
      createdAt: input.serverNow,
    };
    this.events.set(key, syncEvent);

    return { favorite, changeSeq, syncEvent };
  }
}

function eventKey(accountId: string, clientEventId: string): string {
  return `${accountId}:${clientEventId.trim().toLowerCase()}`;
}

function favoriteKey(profileId: string, itemId: string): string {
  return `${profileId}:${itemId}`;
}

function nextChangeSeq(
  counters: Map<string, number>,
  accountId: string,
): number {
  const next = (counters.get(accountId) ?? 0) + 1;
  counters.set(accountId, next);
  return next;
}
