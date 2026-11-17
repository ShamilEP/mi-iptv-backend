import type { DeviceConnectionStatus } from './device-connection-status.js';

/**
 * Realtime event payload published to peer `dev:{deviceId}` channels (BE-076).
 * Clients use this to show “connected” without polling.
 */
export type DevicePresenceEventPayload = {
  readonly type: 'device_presence';
  readonly subjectDeviceId: string;
  readonly connectionStatus: DeviceConnectionStatus;
  readonly serverTimestamp: string;
};

export function buildDevicePresenceEventPayload(input: {
  readonly subjectDeviceId: string;
  readonly connectionStatus: DeviceConnectionStatus;
  readonly serverTimestamp: string;
}): DevicePresenceEventPayload {
  return {
    type: 'device_presence',
    subjectDeviceId: input.subjectDeviceId,
    connectionStatus: input.connectionStatus,
    serverTimestamp: input.serverTimestamp,
  };
}
