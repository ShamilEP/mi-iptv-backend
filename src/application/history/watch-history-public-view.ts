import type { WatchHistoryEntry } from '../../domain/history/watch-history-entry.js';

export type WatchHistoryPublicItem = {
  readonly id: string;
  readonly contentId: string;
  readonly sourceId: string | null;
  readonly positionSec: number | null;
  readonly durationSec: number | null;
  readonly completed: boolean;
  readonly watchedAt: string;
};

export type WatchHistoryListView = {
  readonly historyEnabled: boolean;
  readonly items: readonly WatchHistoryPublicItem[];
};

export function toWatchHistoryPublicItem(
  entry: WatchHistoryEntry,
): WatchHistoryPublicItem {
  return {
    id: entry.id,
    contentId: entry.contentId,
    sourceId: entry.sourceId,
    positionSec: entry.positionSec,
    durationSec: entry.durationSec,
    completed: entry.completed,
    watchedAt: entry.watchedAt.toISOString(),
  };
}
