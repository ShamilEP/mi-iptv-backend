import type { QoeEventRepository } from '../../application/ports/qoe-event-repository.js';
import type { QoeEventRecord } from '../../domain/telemetry/qoe-event.js';

/**
 * Sprint 0 in-memory QoE store (BE-090).
 * Replace with Postgres `telemetry.qoe_events` insert-only adapter.
 */
export class InMemoryQoeEventRepository implements QoeEventRepository {
  private readonly rows: QoeEventRecord[] = [];

  async insertMany(records: readonly QoeEventRecord[]): Promise<number> {
    this.rows.push(...records);
    return records.length;
  }

  /** Test helper — never expose via HTTP. */
  listAll(): readonly QoeEventRecord[] {
    return [...this.rows];
  }

  clear(): void {
    this.rows.length = 0;
  }
}
