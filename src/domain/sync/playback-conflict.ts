import { SyncError } from './sync-error.js';
import type { SyncDecision, SyncOperation, SyncResolvedBy } from './sync-types.js';
import {
  isOptimisticMatch,
  parseSyncVersion,
  versionAfterAcceptedWrite,
} from './sync-version.js';

/**
 * Concurrent multi-device playback window (Backend §3.1 / SQL reference).
 * Within this window, the higher `position` wins unless `forceReset`.
 */
export const PLAYBACK_CONFLICT_WINDOW_MS = 60_000;

export type ExistingPlaybackState = {
  readonly syncVersion: number;
  readonly positionSec: number;
  readonly updatedAt: Date;
  readonly lastDeviceId: string | null;
};

export type IncomingPlaybackWrite = {
  readonly deviceId: string;
  readonly positionSec: number;
  readonly durationSec: number | null;
  readonly completed: boolean;
  /** Last sync_version the client observed (`syncVersion` in the API). */
  readonly baseVersion: number;
  readonly forceReset: boolean;
  /** Authoritative server arrival time — never a device clock. */
  readonly serverNow: Date;
};

export type PlaybackWriteDecision = SyncDecision & {
  readonly operation: SyncOperation;
};

/**
 * Pure conflict resolution for playback upserts.
 * Mirrors `app.upsert_playback_state` steps (3)–(4) after idempotency.
 */
export function resolvePlaybackConflict(
  existing: ExistingPlaybackState | null,
  write: IncomingPlaybackWrite,
): PlaybackWriteDecision {
  const positionSec = parsePositionSec(write.positionSec);
  parseOptionalDurationSec(write.durationSec);
  const baseVersion = parseSyncVersion(write.baseVersion);
  const forceReset = write.forceReset === true;
  const operation: SyncOperation = forceReset ? 'reset' : 'upsert';

  if (existing === null) {
    return decision(true, 'accepted', versionAfterAcceptedWrite(null), operation);
  }

  const serverVersion = parseSyncVersion(existing.syncVersion);

  if (forceReset) {
    return decision(
      true,
      'force_reset',
      versionAfterAcceptedWrite(serverVersion),
      operation,
    );
  }

  if (isOptimisticMatch(baseVersion, serverVersion)) {
    return decision(
      true,
      'accepted',
      versionAfterAcceptedWrite(serverVersion),
      operation,
    );
  }

  if (
    isWithinConflictWindow(existing.updatedAt, write.serverNow) &&
    isDistinctDevice(existing.lastDeviceId, write.deviceId) &&
    positionSec < existing.positionSec
  ) {
    return decision(false, 'max_position', serverVersion, operation);
  }

  return decision(
    true,
    'lww',
    versionAfterAcceptedWrite(serverVersion),
    operation,
  );
}

export function isWithinConflictWindow(
  previousUpdatedAt: Date,
  serverNow: Date,
  windowMs: number = PLAYBACK_CONFLICT_WINDOW_MS,
): boolean {
  const elapsed = serverNow.getTime() - previousUpdatedAt.getTime();
  return elapsed >= 0 && elapsed <= windowMs;
}

function isDistinctDevice(
  lastDeviceId: string | null,
  incomingDeviceId: string,
): boolean {
  return lastDeviceId !== incomingDeviceId;
}

function parsePositionSec(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new SyncError(
      'position must be a non-negative integer (seconds)',
      'PLAYBACK_POSITION_INVALID',
    );
  }
  return value;
}

function parseOptionalDurationSec(value: number | null): number | null {
  if (value === null) {
    return null;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new SyncError(
      'duration must be a non-negative integer (seconds)',
      'PLAYBACK_DURATION_INVALID',
    );
  }
  return value;
}

function decision(
  accepted: boolean,
  resolvedBy: SyncResolvedBy,
  resultVersion: number,
  operation: SyncOperation,
): PlaybackWriteDecision {
  return {
    accepted,
    resolvedBy,
    resultVersion,
    isReplay: false,
    operation,
  };
}
