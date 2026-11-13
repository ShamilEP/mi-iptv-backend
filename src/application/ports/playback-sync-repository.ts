import type { PlaybackState } from '../../domain/sync/playback-state.js';
import type { SyncLog } from '../../domain/sync/sync-log.js';
import type { SyncOperation, SyncResolvedBy } from '../../domain/sync/sync-types.js';

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
  readonly syncLog: SyncLog;
};

/**
 * Persistence for playback upserts + SyncLog ledger (BE-061 / BE-065).
 * Postgres can later wrap `app.upsert_playback_state`.
 */
export interface PlaybackSyncRepository {
  findSyncEvent(
    accountId: string,
    clientEventId: string,
  ): Promise<SyncLog | null>;

  findPlaybackState(
    accountId: string,
    profileId: string,
    contentId: string,
  ): Promise<PlaybackState | null>;

  /** All playback rows for the account (export / cascade). */
  listPlaybackByAccount(accountId: string): Promise<readonly PlaybackState[]>;

  applyPlaybackWrite(
    input: ApplyPlaybackWriteInput,
  ): Promise<ApplyPlaybackWriteResult>;

  /** Hard-delete every playback row for the account. */
  deleteByAccount(accountId: string): Promise<number>;
}
