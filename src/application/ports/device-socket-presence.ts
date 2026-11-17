/**
 * Realtime socket presence for a device (BE-077 gateway owns the source of truth).
 * Push fallback (BE-081) only fires when this reports no open socket.
 */
export interface DeviceSocketPresence {
  hasOpenSocket(accountId: string, deviceId: string): Promise<boolean>;

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
