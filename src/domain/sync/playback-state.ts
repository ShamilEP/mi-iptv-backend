/**
 * Synced Continue Watching / playback progress row (Backend §5.1 `playback_states`).
 */

export type PlaybackState = {
  readonly profileId: string;
  readonly accountId: string;
  readonly contentId: string;
  readonly sourceId: string | null;
  readonly positionSec: number;
  readonly durationSec: number | null;
  readonly completed: boolean;
  readonly lastDeviceId: string | null;
  readonly syncVersion: number;
  readonly changeSeq: number;
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
