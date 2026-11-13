import type { SyncDecision, SyncOperation, SyncResolvedBy } from './sync-types.js';
import {
  isOptimisticMatch,
  parseSyncVersion,
  versionAfterAcceptedWrite,
} from './sync-version.js';

export type ExistingFavoriteState = {
  readonly syncVersion: number;
};

export type IncomingFavoriteWrite = {
  /** `add` → upsert (clear tombstone); `remove` → soft-delete. */
  readonly action: 'add' | 'remove';
  /** Last sync_version the client observed. */
  readonly baseVersion: number;
};

export type FavoriteWriteDecision = SyncDecision & {
  readonly operation: SyncOperation;
};

/**
 * Pure resolution for favorite add/remove.
 * Mirrors `app.set_favorite`: always accepts; marks `lww` when the client's
 * base version does not match the current row.
 */
export function resolveFavoriteConflict(
  existing: ExistingFavoriteState | null,
  write: IncomingFavoriteWrite,
): FavoriteWriteDecision {
  const baseVersion = parseSyncVersion(write.baseVersion);
  const operation: SyncOperation =
    write.action === 'add' ? 'upsert' : 'delete';

  if (existing === null) {
    return decision('accepted', versionAfterAcceptedWrite(null), operation);
  }

  const serverVersion = parseSyncVersion(existing.syncVersion);
  const resolvedBy: SyncResolvedBy = isOptimisticMatch(
    baseVersion,
    serverVersion,
  )
    ? 'accepted'
    : 'lww';

  return decision(
    resolvedBy,
    versionAfterAcceptedWrite(serverVersion),
    operation,
  );
}

function decision(
  resolvedBy: SyncResolvedBy,
  resultVersion: number,
  operation: SyncOperation,
): FavoriteWriteDecision {
  return {
    accepted: true,
    resolvedBy,
    resultVersion,
    isReplay: false,
    operation,
  };
}
