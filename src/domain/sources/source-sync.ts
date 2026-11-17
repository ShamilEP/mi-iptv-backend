import { DomainError } from '../shared/domain-error.js';

/**
 * Configured source sync semantics (ADR-009 / PRD-023 / BE-064 / FR-033).
 *
 * - Deltas: `GET /sync/state` with `entity: "source"` (metadata only).
 * - Mutations: `/sources` CRUD only — each write bumps account `change_seq`.
 * - Never sync credentials/ciphertext to clients.
 * - Never accept `entity: "source"` on `POST /sync/events`.
 */

/** Fields allowed on a source sync delta payload (secret-free). */
export const SOURCE_SYNC_DELTA_FIELDS = [
  'id',
  'kind',
  'name',
  'uriRef',
  'priority',
  'enabled',
  'status',
  'statusReason',
  'itemCount',
  'lastIngestedAt',
  'syncVersion',
] as const;

export type SourceSyncDeltaField = (typeof SOURCE_SYNC_DELTA_FIELDS)[number];

const FORBIDDEN_SOURCE_SYNC_KEYS = [
  'credentialsEncrypted',
  'encKeyId',
  'password',
  'token',
  'username',
  'credentials',
] as const;

/**
 * Fail closed if a projected source delta (or accidental map) contains secrets.
 */
export function assertSourceDeltaHasNoSecrets(
  payload: Readonly<Record<string, unknown>>,
): void {
  for (const key of FORBIDDEN_SOURCE_SYNC_KEYS) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      const value = payload[key];
      if (value !== null && value !== undefined) {
        throw new DomainError(
          'Source sync deltas must not include credentials',
          'SOURCE_SYNC_SECRET_LEAK',
        );
      }
    }
  }
}

export function assertSourceNotInSyncBatch(entity: string): void {
  if (entity.trim().toLowerCase() === 'source') {
    throw new DomainError(
      'Sources sync via /sources CRUD and GET /sync/state — not /sync/events',
      'SOURCE_SYNC_BATCH_FORBIDDEN',
    );
  }
}
