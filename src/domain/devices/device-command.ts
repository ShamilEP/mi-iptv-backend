/**
 * Persisted send-to-TV `play` commands (ADR-008 / Backend §5.2 `device_commands`).
 * D-pad / keyboard / transport stay fire-and-forget on WSS and are not stored.
 */

export const DEVICE_COMMAND_TTL_MS = 5 * 60 * 1000;

export type DeviceCommandAction = 'play';

export type DeviceCommandStatus =
  | 'queued'
  | 'delivered'
  | 'acked'
  | 'expired'
  | 'failed';

export type DeviceCommandPlayPayload = {
  readonly contentId: string;
  readonly sourceId: string;
  readonly startPositionSec?: number;
};

export type DeviceCommand = {
  readonly id: string;
  readonly accountId: string;
  readonly senderDeviceId: string;
  readonly targetDeviceId: string;
  readonly command: DeviceCommandAction;
  readonly payload: DeviceCommandPlayPayload;
  readonly status: DeviceCommandStatus;
  readonly createdAt: Date;
  readonly deliveredAt: Date | null;
  readonly ackedAt: Date | null;
  readonly expiresAt: Date;
};

export function isDeviceCommandAction(
  value: string,
): value is DeviceCommandAction {
  return value === 'play';
}

export function deviceCommandExpiresAt(
  createdAt: Date,
  ttlMs: number = DEVICE_COMMAND_TTL_MS,
): Date {
  return new Date(createdAt.getTime() + ttlMs);
}
