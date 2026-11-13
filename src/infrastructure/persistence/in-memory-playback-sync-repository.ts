import type {
  ApplyPlaybackWriteInput,
  ApplyPlaybackWriteResult,
  PlaybackSyncEvent,
  PlaybackSyncRepository,
} from '../../application/ports/playback-sync-repository.js';
import type { PlaybackState } from '../../domain/sync/playback-state.js';

/**
 * Sprint 0 in-memory playback + sync_events store for BE-061.
 * Replace with a Postgres adapter wrapping `app.upsert_playback_state`.
 */
export class InMemoryPlaybackSyncRepository implements PlaybackSyncRepository {
  private readonly events = new Map<string, PlaybackSyncEvent>();
  private readonly playback = new Map<string, PlaybackState>();
  private readonly changeSeqByAccount = new Map<string, number>();

  async findSyncEvent(
    accountId: string,
    clientEventId: string,
  ): Promise<PlaybackSyncEvent | null> {
    return this.events.get(eventKey(accountId, clientEventId)) ?? null;
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

  async applyPlaybackWrite(
    input: ApplyPlaybackWriteInput,
  ): Promise<ApplyPlaybackWriteResult> {
    const key = eventKey(input.accountId, input.clientEventId);
    if (this.events.has(key)) {
      throw new Error('Duplicate clientEventId write without replay path');
    }

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

    const syncEvent: PlaybackSyncEvent = {
      accountId: input.accountId,
      clientEventId: input.clientEventId,
      deviceId: input.deviceId,
      entityId: `${input.profileId}:${input.contentId}`,
      operation: input.operation,
      accepted: input.accepted,
      resolvedBy: input.resolvedBy,
      resultVersion: input.resultVersion,
      changeSeq,
      clientReportedAt: input.clientReportedAt,
      createdAt: input.serverNow,
    };
    this.events.set(key, syncEvent);

    return { playback, changeSeq, syncEvent };
  }
}

function eventKey(accountId: string, clientEventId: string): string {
  return `${accountId}:${clientEventId.trim().toLowerCase()}`;
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
