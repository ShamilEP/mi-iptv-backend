import { DomainError } from '../shared/domain-error.js';

/**
 * Offline outbox drain (SRS §7 / local `outbox` entity set).
 * Sources remain out of batch until BE-064.
 */
export const BATCHED_SYNC_ENTITIES = ['playback_state', 'favorite'] as const;

export type BatchedSyncEntity = (typeof BATCHED_SYNC_ENTITIES)[number];

/** Max events accepted in one POST /sync/events body. */
export const SYNC_BATCH_MAX_EVENTS = 100;

export function isBatchedSyncEntity(value: string): value is BatchedSyncEntity {
  return (BATCHED_SYNC_ENTITIES as readonly string[]).includes(value);
}

export function assertSyncBatchSize(eventCount: number): void {
  if (!Number.isInteger(eventCount) || eventCount < 1) {
    throw new DomainError(
      'events must be a non-empty array',
      'SYNC_BATCH_INVALID',
    );
  }
  if (eventCount > SYNC_BATCH_MAX_EVENTS) {
    throw new DomainError(
      `events must contain at most ${SYNC_BATCH_MAX_EVENTS} items`,
      'SYNC_BATCH_TOO_LARGE',
    );
  }
}
