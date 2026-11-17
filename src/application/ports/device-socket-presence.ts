import type { DeviceConnectionStatus } from '../../domain/devices/device-connection-status.js';

/**
 * Realtime socket presence for a device (BE-077 gateway owns the source of truth).
 * Push fallback (BE-081) only fires when this reports no open socket.
 * BE-076 exposes online/offline on device list via {@link getConnectionStatuses}.
 */
export interface DeviceSocketPresence {
  hasOpenSocket(accountId: string, deviceId: string): Promise<boolean>;

  /**
   * Batch presence lookup for account device roster (BE-076).
   * Missing / expired keys map to `offline`.
   */
  getConnectionStatuses(
    accountId: string,
    deviceIds: readonly string[],
  ): Promise<ReadonlyMap<string, DeviceConnectionStatus>>;

  /** Bind an open socket + refresh Redis presence TTL (~45s). */
  markConnected(
    accountId: string,
    deviceId: string,
    nodeId: string,
  ): Promise<void>;

  /** Heartbeat / ping — refresh presence TTL without changing node binding. */
  touch(accountId: string, deviceId: string): Promise<void>;

  markDisconnected(accountId: string, deviceId: string): Promise<void>;
}
