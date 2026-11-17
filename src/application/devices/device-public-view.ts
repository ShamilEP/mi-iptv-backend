import type { Device } from '../../domain/devices/device.js';
import type { DeviceConnectionStatus } from '../../domain/devices/device-connection-status.js';

export type DevicePublicView = {
  readonly id: string;
  readonly deviceType: string;
  readonly platform: string;
  readonly name: string | null;
  readonly model: string | null;
  readonly appVersion: string | null;
  readonly osVersion: string | null;
  /** True when a push token is stored; raw token is never returned. */
  readonly pushTokenConfigured: boolean;
  readonly pairedAt: string;
  readonly lastSeenAt: string | null;
  /**
   * Live WSS presence (BE-076). Independent of `lastSeenAt` (HTTP heartbeat).
   * `online` = open realtime socket with unexpired presence TTL.
   */
  readonly connectionStatus: DeviceConnectionStatus;
};

export function toDevicePublicView(
  device: Device,
  connectionStatus: DeviceConnectionStatus = 'offline',
): DevicePublicView {
  return {
    id: device.id,
    deviceType: device.deviceType,
    platform: device.platform,
    name: device.name,
    model: device.model,
    appVersion: device.appVersion,
    osVersion: device.osVersion,
    pushTokenConfigured:
      device.pushToken !== null && device.pushToken.length > 0,
    pairedAt: device.pairedAt.toISOString(),
    lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
    connectionStatus,
  };
}
