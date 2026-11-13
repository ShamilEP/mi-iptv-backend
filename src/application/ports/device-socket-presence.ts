/**
 * Realtime socket presence for a device (BE-077 gateway will own the source of truth).
 * Push fallback (BE-081) only fires when this reports no open socket.
 */
export interface DeviceSocketPresence {
  hasOpenSocket(accountId: string, deviceId: string): Promise<boolean>;
}
