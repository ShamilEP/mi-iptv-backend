import type {
  ApplyPlaybackWriteInput,
  ApplyPlaybackWriteResult,
  PlaybackSyncRepository,
} from '../../application/ports/playback-sync-repository.js';
import type { SyncLogRepository } from '../../application/ports/sync-log-repository.js';
import type { PlaybackState } from '../../domain/sync/playback-state.js';
import type { SyncLog } from '../../domain/sync/sync-log.js';
import { InMemorySyncLogRepository } from './in-memory-sync-log-repository.js';

/**
 * Sprint 0 in-memory playback + SyncLog store for BE-061 / BE-065.
 * Replace with a Postgres adapter wrapping `app.upsert_playback_state`.
 */
export class InMemoryPlaybackSyncRepository implements PlaybackSyncRepository {
  private readonly playback = new Map<string, PlaybackState>();
  private readonly changeSeqByAccount = new Map<string, number>();
  private readonly syncLog: SyncLogRepository;

  constructor(syncLog: SyncLogRepository = new InMemorySyncLogRepository()) {
    this.syncLog = syncLog;
  }

  async findSyncEvent(
    accountId: string,
    clientEventId: string,
  ): Promise<SyncLog | null> {
    return this.syncLog.findByClientEventId(accountId, clientEventId);
  }

  async findPlaybackState(
    accountId: string,
    profileId: string,
    contentId: string,
  ): Promise<PlaybackState | null> {
    const row = this.playback.get(playbackKey(profileId, contentId));
    if (!row || row.accountId !== accountId) {
      return null;
    }
    return row;
  }

  async listPlaybackByAccount(
    accountId: string,
  ): Promise<readonly PlaybackState[]> {
    return [...this.playback.values()]
      .filter((row) => row.accountId === accountId)
      .sort(
        (a, b) =>
          a.profileId.localeCompare(b.profileId) ||
          b.updatedAt.getTime() - a.updatedAt.getTime(),
      );
  }

  async applyPlaybackWrite(
    input: ApplyPlaybackWriteInput,
  ): Promise<ApplyPlaybackWriteResult> {
    let playback: PlaybackState | null = await this.findPlaybackState(
      input.accountId,
      input.profileId,
      input.contentId,
    );
    let changeSeq: number | null = null;

    if (input.accepted) {
      changeSeq = nextChangeSeq(this.changeSeqByAccount, input.accountId);
      if (playback === null) {
        playback = {
          profileId: input.profileId,
          accountId: input.accountId,
          contentId: input.contentId,
          sourceId: input.sourceId,
          positionSec: input.positionSec,
          durationSec: input.durationSec,
          completed: input.completed,
          lastDeviceId: input.deviceId,
          syncVersion: input.resultVersion,
          changeSeq,
          deletedAt: null,
          createdAt: input.serverNow,
          updatedAt: input.serverNow,
        };
      } else {
        playback = {
          ...playback,
          sourceId: input.sourceId,
          positionSec: input.positionSec,
          durationSec: input.durationSec,
          completed: input.completed,
          lastDeviceId: input.deviceId,
          syncVersion: input.resultVersion,
          changeSeq,
          deletedAt: null,
          updatedAt: input.serverNow,
        };
      }
      this.playback.set(
        playbackKey(input.profileId, input.contentId),
        playback,
      );
    }

    const syncLog = await this.syncLog.append({
      accountId: input.accountId,
      clientEventId: input.clientEventId,
      deviceId: input.deviceId,
      entity: 'playback_state',
      entityId: `${input.profileId}:${input.contentId}`,
      operation: input.operation,
      accepted: input.accepted,
      resolvedBy: input.resolvedBy,
      resultVersion: input.resultVersion,
      changeSeq,
      clientReportedAt: input.clientReportedAt,
      createdAt: input.serverNow,
    });

    return { playback, changeSeq, syncLog };
  }

  async deleteByAccount(accountId: string): Promise<number> {
    let count = 0;
    for (const [key, row] of this.playback) {
      if (row.accountId !== accountId) {
        continue;
      }
      this.playback.delete(key);
      count += 1;
    }
    this.changeSeqByAccount.delete(accountId);
    return count;
  }
}

function playbackKey(profileId: string, contentId: string): string {
  return `${profileId}:${contentId}`;
}

function nextChangeSeq(
  counters: Map<string, number>,
  accountId: string,
): number {
  const next = (counters.get(accountId) ?? 0) + 1;
  counters.set(accountId, next);
  return next;
}
