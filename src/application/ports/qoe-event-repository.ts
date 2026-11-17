import type { QoeEventRecord } from '../../domain/telemetry/qoe-event.js';

/**
 * Persist anonymous QoE samples (BE-090).
 * Implementations must never accept or store account identifiers.
 */
export interface QoeEventRepository {
  insertMany(records: readonly QoeEventRecord[]): Promise<number>;
}
