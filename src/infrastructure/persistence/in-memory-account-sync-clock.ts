import type { AccountSyncClock } from '../../application/ports/account-sync-clock.js';

/**
 * Process-local account change_seq / tombstone_floor (Sprint 0 until Postgres).
 */
export class InMemoryAccountSyncClock implements AccountSyncClock {
  private readonly changeSeqByAccount = new Map<string, number>();
  private readonly tombstoneFloorByAccount = new Map<string, number>();

  async nextChangeSeq(accountId: string): Promise<number> {
    const next = (this.changeSeqByAccount.get(accountId) ?? 0) + 1;
    this.changeSeqByAccount.set(accountId, next);
    return next;
  }

  async getTombstoneFloor(accountId: string): Promise<number> {
    return this.tombstoneFloorByAccount.get(accountId) ?? 0;
  }

  async raiseTombstoneFloor(accountId: string, floor: number): Promise<void> {
    const current = await this.getTombstoneFloor(accountId);
    if (floor > current) {
      this.tombstoneFloorByAccount.set(accountId, floor);
    }
  }

  /** Test helper — clear counters for an account. */
  reset(accountId: string): void {
    this.changeSeqByAccount.delete(accountId);
    this.tombstoneFloorByAccount.delete(accountId);
  }
}
