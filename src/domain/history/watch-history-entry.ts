/**
 * Per-profile watch history row (FR-021 / BE-105).
 * Separate from Continue Watching (`playback_states`).
 */
export type WatchHistoryEntry = {
  readonly id: string;
  readonly profileId: string;
  readonly accountId: string;
  readonly contentId: string;
  readonly sourceId: string | null;
  readonly positionSec: number | null;
  readonly durationSec: number | null;
  readonly completed: boolean;
  readonly watchedAt: Date;
  readonly createdAt: Date;
};
