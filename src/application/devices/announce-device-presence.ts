import { toServerTimestamp } from '../../domain/api/server-clock.js';
import {
  isDeviceConnectionStatus,
  type DeviceConnectionStatus,
} from '../../domain/devices/device-connection-status.js';
import { buildDevicePresenceEventPayload } from '../../domain/devices/device-presence-event.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import type { DeviceRepository } from '../ports/device-repository.js';
import type { FanOutDeviceCommand } from '../realtime/fan-out-device-command.js';
import type { NotifyCompanionStatusFallback } from './notify-companion-status-fallback.js';

export type AnnounceDevicePresenceInput = {
  readonly accountId: string;
  readonly subjectDeviceId: string;
  readonly connectionStatus: DeviceConnectionStatus;
};

export type AnnounceDevicePresenceResult = {
  readonly connectionStatus: DeviceConnectionStatus;
  readonly peersNotified: number;
  readonly companionPushSent: number;
};

/**
 * Fan out live presence to peer `dev:{id}` channels so clients can show
 * “connected” (BE-076 / US-08). When a TV goes online/offline, also invoke
 * companion push fallback for backgrounded companions (BE-081).
 */
export class AnnounceDevicePresence {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly fanOut: FanOutDeviceCommand,
    private readonly notifyCompanionStatusFallback: NotifyCompanionStatusFallback,
  ) {}

  async execute(
    input: AnnounceDevicePresenceInput,
  ): Promise<AnnounceDevicePresenceResult> {
    const accountId = requireNonEmpty(input.accountId, 'accountId');
    const subjectDeviceId = requireNonEmpty(
      input.subjectDeviceId,
      'subjectDeviceId',
    );
    if (!isDeviceConnectionStatus(input.connectionStatus)) {
      throw new DomainError(
        'connectionStatus must be online or offline',
        'DEVICE_PRESENCE_STATUS_INVALID',
      );
    }

    const subject = await this.devices.findById(accountId, subjectDeviceId);
    if (subject === null || subject.revokedAt !== null) {
      return {
        connectionStatus: input.connectionStatus,
        peersNotified: 0,
        companionPushSent: 0,
      };
    }

    const peers = (await this.devices.listByAccount(accountId)).filter(
      (device) =>
        device.id !== subjectDeviceId && device.revokedAt === null,
    );

    const payload = buildDevicePresenceEventPayload({
      subjectDeviceId,
      connectionStatus: input.connectionStatus,
      serverTimestamp: toServerTimestamp(new Date()),
    });

    let peersNotified = 0;
    for (const peer of peers) {
      const result = await this.fanOut.execute({
        targetDeviceId: peer.id,
        payload,
      });
      if (result.subscriberCount > 0) {
        peersNotified += 1;
      }
    }

    let companionPushSent = 0;
    if (subject.deviceType === 'tv') {
      const push = await this.notifyCompanionStatusFallback.execute({
        accountId,
        status:
          input.connectionStatus === 'online' ? 'connected' : 'disconnected',
        subjectDeviceId,
      });
      companionPushSent = push.sent;
    }

    return {
      connectionStatus: input.connectionStatus,
      peersNotified,
      companionPushSent,
    };
  }
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new DomainError(`${field} is required`, 'DEVICE_CONTEXT_INVALID');
  }
  return trimmed;
}
