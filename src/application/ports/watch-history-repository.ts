import type { WatchHistoryEntry } from '../../domain/history/watch-history-entry.js';

export type NewWatchHistoryEntry = Omit<WatchHistoryEntry, 'createdAt'> & {
  readonly createdAt?: Date;
};

/**
 * Persistence for per-profile watch history (BE-105 / FR-021).
 * Distinct from playback_states (Continue Watching).
 */
export interface WatchHistoryRepository {
  listByProfile(
    accountId: string,
    profileId: string,
  ): Promise<readonly WatchHistoryEntry[]>;

  listByAccount(accountId: string): Promise<readonly WatchHistoryEntry[]>;

  insert(entry: NewWatchHistoryEntry): Promise<WatchHistoryEntry>;

  /** Hard-delete all history for one profile (clear-history). */
  deleteByProfile(accountId: string, profileId: string): Promise<number>;

  deleteByAccount(accountId: string): Promise<number>;
}
