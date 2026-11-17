import type {
  RealtimeDeviceBus,
  RealtimeDeviceBusHandler,
} from '../../application/ports/realtime-device-bus.js';
import type { RedisClient } from '../../application/ports/redis-client.js';
import { deviceChannel } from '../../domain/realtime/realtime-protocol.js';

/**
 * Redis/Valkey Pub/Sub fan-out on `dev:{deviceId}` (BE-078 / Backend §5.2).
 * Any BFF node can publish; only nodes subscribed for an open TV socket deliver.
 */
export class RedisRealtimeDeviceBus implements RealtimeDeviceBus {
  constructor(private readonly redis: RedisClient) {}

  async publish(deviceId: string, message: string): Promise<number> {
    return await this.redis.publish(deviceChannel(deviceId), message);
  }

  async subscribe(
    deviceId: string,
    handler: RealtimeDeviceBusHandler,
  ): Promise<() => void> {
    return await this.redis.subscribe(deviceChannel(deviceId), handler);
  }
}
