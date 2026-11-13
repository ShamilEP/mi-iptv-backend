/**
 * Sync domain types aligned with `app.sync_events` / `app.sync_result`
 * (Backend §3.1, ADR-005, BE-060).
 */

export type SyncResolvedBy =
  | 'accepted'
  | 'lww'
  | 'max_position'
  | 'force_reset';

export type SyncEntity =
  | 'playback_state'
  | 'favorite'
  | 'source'
  | 'setting';

export type SyncOperation = 'upsert' | 'delete' | 'reset';

export type SyncDecision = {
  readonly accepted: boolean;
  readonly resolvedBy: SyncResolvedBy;
  /** Entity sync_version after this decision (current row if rejected/replay). */
  readonly resultVersion: number;
  /** True when the outcome is a replay of a prior clientEventId. */
  readonly isReplay: boolean;
};

export type RecordedSyncEvent = {
  readonly accepted: boolean;
  readonly resolvedBy: SyncResolvedBy;
  readonly resultVersion: number | null;
  readonly changeSeq: number | null;
};
