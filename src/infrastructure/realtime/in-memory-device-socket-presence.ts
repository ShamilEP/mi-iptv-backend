import type { DeviceSocketPresence } from '../../application/ports/device-socket-presence.js';

/**
 * Sprint 0 stand-in until BE-077 owns live WSS presence.
 * Tests / composition can mark devices as connected.
 */
export class InMemoryDeviceSocketPresence implements DeviceSocketPresence {
  private readonly open = new Set<string>();

  markOpen(accountId: string, deviceId: string): void {
    this.open.add(key(accountId, deviceId));
  }

  markClosed(accountId: string, deviceId: string): void {
    this.open.delete(key(accountId, deviceId));
  }

  clear(): void {
    this.open.clear();
  }

  async hasOpenSocket(accountId: string, deviceId: string): Promise<boolean> {
    return this.open.has(key(accountId, deviceId));
  }
}

function key(accountId: string, deviceId: string): string {
  return `${accountId}:${deviceId}`;
}
