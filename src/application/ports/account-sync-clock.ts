/**
 * Per-account monotonic `change_seq` + tombstone floor (ADR-005 / schema `app.accounts`).
 * Postgres will wrap `app.next_change_seq` and `tombstone_floor`.
 */
export interface AccountSyncClock {
  nextChangeSeq(accountId: string): Promise<number>;
  getTombstoneFloor(accountId: string): Promise<number>;
  /**
   * Raise the floor after tombstone purge (or tests).
   * Cursors strictly below this value require full resync.
   */
  raiseTombstoneFloor(accountId: string, floor: number): Promise<void>;
}
