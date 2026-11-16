import { parseClientEventId } from './client-event-id.js';
import { replayIfDuplicate } from './idempotency.js';
import {
  resolveSettingsConflict,
  type ExistingSettingsState,
  type IncomingSettingsWrite,
  type SettingsWriteDecision,
} from './settings-conflict.js';
import type { RecordedSyncEvent } from './sync-types.js';

export type DecideSettingsWriteInput = {
  readonly clientEventId: string;
  readonly priorEvent: RecordedSyncEvent | null;
  readonly existing: ExistingSettingsState | null;
  readonly write: IncomingSettingsWrite;
};

/**
 * Full settings write decision: idempotency first, then favorites-style LWW.
 */
export function decideSettingsWrite(
  input: DecideSettingsWriteInput,
): SettingsWriteDecision {
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

  return resolveSettingsConflict(input.existing, input.write);
}
