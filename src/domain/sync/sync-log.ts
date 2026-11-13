import type {
  SyncEntity,
  SyncOperation,
  SyncResolvedBy,
} from './sync-types.js';

/**
 * SRS SyncLog / `app.sync_events` ledger row (BE-065).
 * Persists entity, operation, and resolvedBy for audit + client notices.
 */
export type SyncLog = {
  readonly accountId: string;
  readonly clientEventId: string;
  readonly deviceId: string | null;
  readonly entity: SyncEntity;
  readonly entityId: string;
  readonly operation: SyncOperation;
  readonly accepted: boolean;
  readonly resolvedBy: SyncResolvedBy;
  readonly resultVersion: number | null;
  readonly changeSeq: number | null;
  readonly clientReportedAt: Date | null;
  readonly createdAt: Date;
};

/**
 * Payload for the non-intrusive client "Sync Conflict" notice (FR-034 / Frontend).
 * Present when `resolvedBy` is not a clean optimistic accept.
 */
export type SyncConflictReport = {
  readonly resolved: true;
  readonly notice: 'Sync Conflict';
  readonly entity: SyncEntity;
  readonly operation: SyncOperation;
  readonly resolvedBy: SyncResolvedBy;
};

export function shouldReportSyncConflict(
  resolvedBy: SyncResolvedBy,
): boolean {
  return resolvedBy !== 'accepted';
}

export function buildSyncConflictReport(
  entity: SyncEntity,
  operation: SyncOperation,
  resolvedBy: SyncResolvedBy,
): SyncConflictReport | null {
  if (!shouldReportSyncConflict(resolvedBy)) {
    return null;
  }
  return {
    resolved: true,
    notice: 'Sync Conflict',
    entity,
    operation,
    resolvedBy,
  };
}
