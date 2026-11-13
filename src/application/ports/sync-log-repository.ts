import type { SyncLog } from '../../domain/sync/sync-log.js';

/**
 * Persistence port for the SyncLog / `app.sync_events` ledger (BE-065).
 */
export interface SyncLogRepository {
  findByClientEventId(
    accountId: string,
    clientEventId: string,
  ): Promise<SyncLog | null>;

  append(entry: SyncLog): Promise<SyncLog>;
}
