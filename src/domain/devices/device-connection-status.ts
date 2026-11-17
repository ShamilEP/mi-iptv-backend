/**
 * Live connection status for TV / companion devices (BE-076).
 * Authoritative source: realtime socket presence (`presence:{deviceId}`), not `lastSeenAt`.
 */

export const DEVICE_CONNECTION_STATUSES = ['online', 'offline'] as const;

export type DeviceConnectionStatus =
  (typeof DEVICE_CONNECTION_STATUSES)[number];

export function isDeviceConnectionStatus(
  value: string,
): value is DeviceConnectionStatus {
  return (DEVICE_CONNECTION_STATUSES as readonly string[]).includes(value);
}

export function connectionStatusFromSocketOpen(
  socketOpen: boolean,
): DeviceConnectionStatus {
  return socketOpen ? 'online' : 'offline';
}
