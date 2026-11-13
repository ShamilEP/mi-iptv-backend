import type { RecordedSyncEvent, SyncDecision } from './sync-types.js';

/**
 * If `prior` exists for this account + clientEventId, return the original
 * outcome without applying the write again (Backend §3.1 idempotency).
 *
 * `currentEntityVersion` is the live entity `sync_version` (0 when missing),
 * matching `COALESCE(v_version, 0)` in `app.upsert_playback_state` /
 * `app.set_favorite`.
 */
export function replayIfDuplicate(
  prior: RecordedSyncEvent | null,
  currentEntityVersion: number | null,
): SyncDecision | null {
  if (prior === null) {
    return null;
  }

  return {
    accepted: prior.accepted,
    resolvedBy: prior.resolvedBy,
    resultVersion: currentEntityVersion ?? 0,
    isReplay: true,
  };
}
