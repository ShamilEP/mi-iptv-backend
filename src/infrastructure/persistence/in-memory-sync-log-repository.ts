import type { SyncLogRepository } from '../../application/ports/sync-log-repository.js';
import type { SyncLog } from '../../domain/sync/sync-log.js';

/**
 * Sprint 0 in-memory SyncLog ledger (BE-065).
 * Shared across playback/favorites so `(accountId, clientEventId)` is unique.
 */
export class InMemorySyncLogRepository implements SyncLogRepository {
  private readonly events = new Map<string, SyncLog>();

  async findByClientEventId(
    accountId: string,
    clientEventId: string,
  ): Promise<SyncLog | null> {
    return this.events.get(eventKey(accountId, clientEventId)) ?? null;
  }

  async append(entry: SyncLog): Promise<SyncLog> {
    const key = eventKey(entry.accountId, entry.clientEventId);
    if (this.events.has(key)) {
      throw new Error('Duplicate clientEventId write without replay path');
    }
    this.events.set(key, entry);
    return entry;
  }

  async deleteByAccount(accountId: string): Promise<number> {
    let count = 0;
    for (const [key, row] of this.events) {
      if (row.accountId !== accountId) {
        continue;
      }
      this.events.delete(key);
      count += 1;
    }
    return count;
  }
}

function eventKey(accountId: string, clientEventId: string): string {
  return `${accountId}:${clientEventId.trim().toLowerCase()}`;
}
