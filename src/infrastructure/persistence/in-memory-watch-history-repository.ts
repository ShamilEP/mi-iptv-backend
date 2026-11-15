import type {
  NewWatchHistoryEntry,
  WatchHistoryRepository,
} from '../../application/ports/watch-history-repository.js';
import type { WatchHistoryEntry } from '../../domain/history/watch-history-entry.js';

/**
 * Sprint 0 in-memory watch history. Replace with Postgres over `app.watch_history`.
 */
export class InMemoryWatchHistoryRepository implements WatchHistoryRepository {
  private readonly byId = new Map<string, WatchHistoryEntry>();

  async listByProfile(
    accountId: string,
    profileId: string,
  ): Promise<readonly WatchHistoryEntry[]> {
    return [...this.byId.values()]
      .filter(
        (row) => row.accountId === accountId && row.profileId === profileId,
      )
      .sort((a, b) => b.watchedAt.getTime() - a.watchedAt.getTime());
  }

  async listByAccount(accountId: string): Promise<readonly WatchHistoryEntry[]> {
    return [...this.byId.values()]
      .filter((row) => row.accountId === accountId)
      .sort(
        (a, b) =>
          a.profileId.localeCompare(b.profileId) ||
          b.watchedAt.getTime() - a.watchedAt.getTime(),
      );
  }

  async insert(entry: NewWatchHistoryEntry): Promise<WatchHistoryEntry> {
    const now = new Date();
    const row: WatchHistoryEntry = {
      ...entry,
      createdAt: entry.createdAt ?? now,
    };
    this.byId.set(row.id, row);
    return row;
  }

  async deleteByProfile(accountId: string, profileId: string): Promise<number> {
    let count = 0;
    for (const [id, row] of this.byId) {
      if (row.accountId !== accountId || row.profileId !== profileId) {
        continue;
      }
      this.byId.delete(id);
      count += 1;
    }
    return count;
  }

  async deleteByAccount(accountId: string): Promise<number> {
    let count = 0;
    for (const [id, row] of this.byId) {
      if (row.accountId !== accountId) {
        continue;
      }
      this.byId.delete(id);
      count += 1;
    }
    return count;
  }
}
