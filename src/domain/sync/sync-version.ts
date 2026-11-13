import { SyncError } from './sync-error.js';

/** First version assigned when a synced entity row is created. */
export const INITIAL_SYNC_VERSION = 1;

/**
 * Parses a client/server sync version (non-negative integer).
 * `0` is allowed as a base version when the client has never observed the row.
 */
export function parseSyncVersion(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new SyncError(
      'syncVersion must be a non-negative integer',
      'SYNC_VERSION_INVALID',
    );
  }
  return value;
}

/** Optimistic concurrency match: client base equals server current. */
export function isOptimisticMatch(
  baseVersion: number,
  serverVersion: number,
): boolean {
  return (
    parseSyncVersion(baseVersion) === parseSyncVersion(serverVersion)
  );
}

/** Next version after an accepted write against an existing row. */
export function nextSyncVersion(currentVersion: number): number {
  return parseSyncVersion(currentVersion) + 1;
}

/**
 * Version after an accepted write.
 * New row → {@link INITIAL_SYNC_VERSION}; existing → current + 1.
 */
export function versionAfterAcceptedWrite(
  existingVersion: number | null,
): number {
  if (existingVersion === null) {
    return INITIAL_SYNC_VERSION;
  }
  return nextSyncVersion(existingVersion);
}
