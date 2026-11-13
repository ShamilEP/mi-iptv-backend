import type { PlaybackState } from '../../domain/sync/playback-state.js';
import type {
  RecordedSyncEvent,
  SyncOperation,
  SyncResolvedBy,
} from '../../domain/sync/sync-types.js';

export type PlaybackSyncEvent = RecordedSyncEvent & {
  readonly accountId: string;
  readonly clientEventId: string;
  readonly deviceId: string | null;
  readonly entityId: string;
  readonly operation: SyncOperation;
  readonly clientReportedAt: Date | null;
  readonly createdAt: Date;
};

export type ApplyPlaybackWriteInput = {
  readonly accountId: string;
  readonly profileId: string;
  readonly deviceId: string;
  readonly clientEventId: string;
  readonly contentId: string;
  readonly sourceId: string | null;
  readonly positionSec: number;
  readonly durationSec: number | null;
  readonly completed: boolean;
  readonly clientReportedAt: Date | null;
  readonly accepted: boolean;
  readonly resolvedBy: SyncResolvedBy;
  readonly operation: SyncOperation;
  readonly resultVersion: number;
  readonly serverNow: Date;
};

export type ApplyPlaybackWriteResult = {
  readonly playback: PlaybackState | null;
  readonly changeSeq: number | null;
  readonly syncEvent: PlaybackSyncEvent;
};

/**
 * Persistence for playback upserts + sync_events ledger (BE-061).
 * Postgres can later wrap `app.upsert_playback_state`.
 */
export interface PlaybackSyncRepository {
  findSyncEvent(
    accountId: string,
    clientEventId: string,
  ): Promise<PlaybackSyncEvent | null>;

  findPlaybackState(
    accountId: string,
    profileId: string,
    contentId: string,
  ): Promise<PlaybackState | null>;

  applyPlaybackWrite(
    input: ApplyPlaybackWriteInput,
  ): Promise<ApplyPlaybackWriteResult>;
}
