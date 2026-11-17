/**
 * Unified sync delta row for GET /sync/state (ADR-005 / ADR-009 / BE-062).
 */

export const SYNC_DELTA_ENTITIES = [
  'playback_state',
  'favorite',
  'source',
] as const;

export type SyncDeltaEntity = (typeof SYNC_DELTA_ENTITIES)[number];

export type SyncDeltaChange = {
  readonly entity: SyncDeltaEntity;
  readonly seq: number;
  readonly deleted: boolean;
  /** Secret-free projection (sources never include credentials). */
  readonly payload: Readonly<Record<string, unknown>>;
};

export type SyncStatePage = {
  readonly changes: readonly SyncDeltaChange[];
  /** Last `seq` in this page (use as next request cursor). */
  readonly nextCursor: number;
  readonly serverTimestamp: string;
  readonly truncated: boolean;
};
