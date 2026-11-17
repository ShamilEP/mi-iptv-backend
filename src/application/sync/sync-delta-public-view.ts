import { assertSourceDeltaHasNoSecrets } from '../../domain/sources/source-sync.js';
import type { UserSource } from '../../domain/sources/user-source.js';
import type { Favorite } from '../../domain/sync/favorite.js';
import type { PlaybackState } from '../../domain/sync/playback-state.js';
import type { SyncDeltaChange } from '../../domain/sync/sync-delta.js';

export function toPlaybackStateDelta(row: PlaybackState): SyncDeltaChange {
  return {
    entity: 'playback_state',
    seq: row.changeSeq,
    deleted: row.deletedAt !== null,
    payload: {
      profileId: row.profileId,
      contentId: row.contentId,
      sourceId: row.sourceId,
      position: row.positionSec,
      duration: row.durationSec,
      completed: row.completed,
      syncVersion: row.syncVersion,
      updatedAt: row.updatedAt.toISOString(),
    },
  };
}

export function toFavoriteDelta(row: Favorite): SyncDeltaChange {
  return {
    entity: 'favorite',
    seq: row.changeSeq,
    deleted: row.deletedAt !== null,
    payload: {
      profileId: row.profileId,
      itemId: row.itemId,
      sortOrder: row.sortOrder,
      syncVersion: row.syncVersion,
      updatedAt: row.updatedAt.toISOString(),
    },
  };
}

/** Metadata-only — never credentials / ciphertext (ADR-009 / BE-064). */
export function toSourceDelta(row: UserSource): SyncDeltaChange {
  const payload: Record<string, unknown> = {
    id: row.id,
    kind: row.kind,
    name: row.name,
    uriRef: row.uriRef,
    priority: row.priority,
    enabled: row.enabled,
    status: row.status,
    statusReason: row.statusReason,
    itemCount: row.itemCount,
    lastIngestedAt:
      row.lastIngestedAt !== null ? row.lastIngestedAt.toISOString() : null,
    syncVersion: row.syncVersion,
  };
  assertSourceDeltaHasNoSecrets(payload);
  return {
    entity: 'source',
    seq: row.changeSeq,
    deleted: row.deletedAt !== null,
    payload,
  };
}
