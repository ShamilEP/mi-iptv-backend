import type { DeviceSocketPresence } from '../../application/ports/device-socket-presence.js';
import { REALTIME_PRESENCE_TTL_SECONDS } from '../../domain/realtime/realtime-limits.js';

type PresenceEntry = {
  readonly accountId: string;
  readonly nodeId: string;
  expiresAtMs: number;
};

/**
 * Process-local presence for Sprint 0 / unit tests (BE-077 / BE-081).
 */
export class InMemoryDeviceSocketPresence implements DeviceSocketPresence {
  private readonly open = new Map<string, PresenceEntry>();
  private readonly ttlMs: number;

  constructor(ttlSeconds = REALTIME_PRESENCE_TTL_SECONDS) {
    this.ttlMs = ttlSeconds * 1000;
  }

  /** Test helper used by BE-081 fixtures. */
  markOpen(accountId: string, deviceId: string): void {
    void this.markConnected(accountId, deviceId, 'test-node');
  }

  markClosed(accountId: string, deviceId: string): void {
    void this.markDisconnected(accountId, deviceId);
  }

  clear(): void {
    this.open.clear();
  }

  async hasOpenSocket(accountId: string, deviceId: string): Promise<boolean> {
    const entry = this.open.get(key(accountId, deviceId));
    if (!entry) {
      return false;
    }
    if (entry.expiresAtMs <= Date.now()) {
      this.open.delete(key(accountId, deviceId));
      return false;
    }
    return entry.accountId === accountId;
  }

  async markConnected(
    accountId: string,
    deviceId: string,
    nodeId: string,
  ): Promise<void> {
    this.open.set(key(accountId, deviceId), {
      accountId,
      nodeId,
      expiresAtMs: Date.now() + this.ttlMs,
    });
  }

  async touch(accountId: string, deviceId: string): Promise<void> {
    const existing = this.open.get(key(accountId, deviceId));
    if (!existing || existing.accountId !== accountId) {
      return;
    }
    this.open.set(key(accountId, deviceId), {
      ...existing,
      expiresAtMs: Date.now() + this.ttlMs,
    });
  }

  async markDisconnected(accountId: string, deviceId: string): Promise<void> {
    const existing = this.open.get(key(accountId, deviceId));
    if (!existing || existing.accountId !== accountId) {
      return;
    }
    this.open.delete(key(accountId, deviceId));
  }
}

function key(accountId: string, deviceId: string): string {
  return `${accountId}:${deviceId}`;
}
