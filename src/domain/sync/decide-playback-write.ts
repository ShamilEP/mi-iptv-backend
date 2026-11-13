import { parseClientEventId } from './client-event-id.js';
import { replayIfDuplicate } from './idempotency.js';
import {
  resolvePlaybackConflict,
  type ExistingPlaybackState,
  type IncomingPlaybackWrite,
  type PlaybackWriteDecision,
} from './playback-conflict.js';
import type { RecordedSyncEvent, SyncOperation } from './sync-types.js';

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
  if (replay !== null) {
    return {
      ...replay,
      operation: inferReplayOperation(input.priorEvent, input.write.forceReset),
    };
  }

  return resolvePlaybackConflict(input.existing, input.write);
}

function inferReplayOperation(
  prior: RecordedSyncEvent | null,
  forceReset: boolean,
): SyncOperation {
  // Replay returns the prior outcome; operation is not stored on RecordedSyncEvent
  // in the SQL result type — derive a stable label for callers/tests.
  void prior;
  return forceReset ? 'reset' : 'upsert';
}
