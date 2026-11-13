import { parseClientEventId } from './client-event-id.js';
import { replayIfDuplicate } from './idempotency.js';
import {
  resolvePlaybackConflict,
  type ExistingPlaybackState,
  type IncomingPlaybackWrite,
  type PlaybackWriteDecision,
} from './playback-conflict.js';
import type { RecordedSyncEvent } from './sync-types.js';

export type DecidePlaybackWriteInput = {
  readonly clientEventId: string;
  readonly priorEvent: RecordedSyncEvent | null;
  readonly existing: ExistingPlaybackState | null;
  readonly write: IncomingPlaybackWrite;
};

/**
 * Full playback write decision: idempotency first, then conflict rules.
 * Framework-free; persistence applies the decision and records the ledger.
 */
export function decidePlaybackWrite(
  input: DecidePlaybackWriteInput,
): PlaybackWriteDecision {
  parseClientEventId(input.clientEventId);

  const replay = replayIfDuplicate(
    input.priorEvent,
    input.existing?.syncVersion ?? null,
  );
  if (replay !== null && input.priorEvent !== null) {
    return {
      ...replay,
      operation: input.priorEvent.operation,
    };
  }

  return resolvePlaybackConflict(input.existing, input.write);
}
