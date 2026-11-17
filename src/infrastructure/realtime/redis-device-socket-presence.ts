import type { DeviceSocketPresence } from '../../application/ports/device-socket-presence.js';
import type { RedisClient } from '../../application/ports/redis-client.js';
import {
  connectionStatusFromSocketOpen,
  type DeviceConnectionStatus,
} from '../../domain/devices/device-connection-status.js';
import { REALTIME_PRESENCE_TTL_SECONDS } from '../../domain/realtime/realtime-limits.js';
import { presenceKey } from '../../domain/realtime/realtime-protocol.js';

type PresencePayload = {
  readonly accountId: string;
  readonly nodeId: string;
};

/**
 * Redis `presence:{deviceId}` binding with ~45s TTL (INF-022 / BE-077).
 */
export class RedisDeviceSocketPresence implements DeviceSocketPresence {
  constructor(
    private readonly redis: RedisClient,
    private readonly ttlSeconds = REALTIME_PRESENCE_TTL_SECONDS,
  ) {}

  async hasOpenSocket(accountId: string, deviceId: string): Promise<boolean> {
    const raw = await this.redis.get(presenceKey(deviceId));
    if (raw === null) {
      return false;
    }
    try {
      const parsed = JSON.parse(raw) as PresencePayload;
      return parsed.accountId === accountId;
    } catch {
      return false;
    }
  }

  async getConnectionStatuses(
    accountId: string,
    deviceIds: readonly string[],
  ): Promise<ReadonlyMap<string, DeviceConnectionStatus>> {
    const result = new Map<string, DeviceConnectionStatus>();
    for (const deviceId of deviceIds) {
      const open = await this.hasOpenSocket(accountId, deviceId);
      result.set(deviceId, connectionStatusFromSocketOpen(open));
    }
    return result;
  }

  async markConnected(
    accountId: string,
    deviceId: string,
    nodeId: string,
  ): Promise<void> {
    const payload: PresencePayload = { accountId, nodeId };
    await this.redis.set(presenceKey(deviceId), JSON.stringify(payload), {
      ttlSeconds: this.ttlSeconds,
    });
  }

  async touch(accountId: string, deviceId: string): Promise<void> {
    const raw = await this.redis.get(presenceKey(deviceId));
    if (raw === null) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as PresencePayload;
      if (parsed.accountId !== accountId) {
        return;
      }
      await this.redis.set(presenceKey(deviceId), raw, {
        ttlSeconds: this.ttlSeconds,
      });
    } catch {
      /* ignore corrupt */
    }
  }

  async markDisconnected(accountId: string, deviceId: string): Promise<void> {
    const raw = await this.redis.get(presenceKey(deviceId));
    if (raw === null) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as PresencePayload;
      if (parsed.accountId !== accountId) {
        return;
      }
      await this.redis.del(presenceKey(deviceId));
    } catch {
      await this.redis.del(presenceKey(deviceId));
    }
  }
}
