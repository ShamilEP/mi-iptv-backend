import type { SyncDecision, SyncOperation, SyncResolvedBy } from './sync-types.js';
import {
  isOptimisticMatch,
  parseSyncVersion,
  versionAfterAcceptedWrite,
} from './sync-version.js';

export type ExistingSettingsState = {
  readonly syncVersion: number;
};

export type IncomingSettingsWrite = {
  /** Last sync_version the client observed. */
  readonly baseVersion: number;
};

export type SettingsWriteDecision = SyncDecision & {
  readonly operation: SyncOperation;
};

/**
 * Pure resolution for profile settings upserts (BE-106).
 * Same conflict rules as favorites: always accept; `lww` when base ≠ server.
 */
export function resolveSettingsConflict(
  existing: ExistingSettingsState | null,
  write: IncomingSettingsWrite,
): SettingsWriteDecision {
  const baseVersion = parseSyncVersion(write.baseVersion);
  const operation: SyncOperation = 'upsert';

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
): SettingsWriteDecision {
  return {
    accepted: true,
    resolvedBy,
    resultVersion,
    isReplay: false,
    operation,
  };
}
