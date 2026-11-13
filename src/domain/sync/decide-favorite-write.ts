import { parseClientEventId } from './client-event-id.js';
import {
  resolveFavoriteConflict,
  type ExistingFavoriteState,
  type FavoriteWriteDecision,
  type IncomingFavoriteWrite,
} from './favorite-conflict.js';
import { replayIfDuplicate } from './idempotency.js';
import type { RecordedSyncEvent } from './sync-types.js';

export type DecideFavoriteWriteInput = {
  readonly clientEventId: string;
  readonly priorEvent: RecordedSyncEvent | null;
  readonly existing: ExistingFavoriteState | null;
  readonly write: IncomingFavoriteWrite;
};

/**
 * Full favorite write decision: idempotency first, then LWW labeling.
 */
export function decideFavoriteWrite(
  input: DecideFavoriteWriteInput,
): FavoriteWriteDecision {
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

  return resolveFavoriteConflict(input.existing, input.write);
}
