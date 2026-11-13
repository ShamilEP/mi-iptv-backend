import { DomainError } from '../../domain/shared/domain-error.js';
import {
  assertCompanionStatusKind,
  companionStatusBody,
  companionStatusTitle,
  type CompanionStatusKind,
} from '../../domain/devices/companion-status.js';
import type { DeviceRepository } from '../ports/device-repository.js';
import type { DeviceSocketPresence } from '../ports/device-socket-presence.js';
import type {
  PushNotifier,
  PushSendResult,
} from '../ports/push-notifier.js';

export type NotifyCompanionStatusFallbackInput = {
  readonly accountId: string;
  readonly status: string;
  /** Optional TV / companion id related to the event (audit data only). */
  readonly subjectDeviceId?: string | null;
};

export type CompanionPushAttempt = {
  readonly deviceId: string;
  readonly platform: string;
  readonly skippedBecauseSocketOpen: boolean;
  readonly skippedBecauseNoToken: boolean;
  readonly result: PushSendResult | null;
};

export type NotifyCompanionStatusFallbackResult = {
  readonly status: CompanionStatusKind;
  readonly attempted: readonly CompanionPushAttempt[];
  readonly sent: number;
};

/**
 * SRS §9 / BE-081: when companions have no open realtime socket, send basic
 * status pushes (connected / disconnected / pairing_error) via FCM/APNs port.
 */
export class NotifyCompanionStatusFallback {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly presence: DeviceSocketPresence,
    private readonly pushNotifier: PushNotifier,
  ) {}

  async execute(
    input: NotifyCompanionStatusFallbackInput,
  ): Promise<NotifyCompanionStatusFallbackResult> {
    assertNonEmpty(input.accountId, 'accountId');
    const status = assertCompanionStatusKind(input.status.trim());
    const title = companionStatusTitle(status);
    const body = companionStatusBody(status);
    const subjectDeviceId = input.subjectDeviceId?.trim() || null;

    const companions = (await this.devices.listByAccount(input.accountId)).filter(
      (device) => device.deviceType === 'companion' && device.revokedAt === null,
    );

    const attempted: CompanionPushAttempt[] = [];
    let sent = 0;

    for (const device of companions) {
      if (device.pushToken === null || device.pushToken.length === 0) {
        attempted.push({
          deviceId: device.id,
          platform: device.platform,
          skippedBecauseSocketOpen: false,
          skippedBecauseNoToken: true,
          result: null,
        });
        continue;
      }

      const socketOpen = await this.presence.hasOpenSocket(
        input.accountId,
        device.id,
      );
      if (socketOpen) {
        attempted.push({
          deviceId: device.id,
          platform: device.platform,
          skippedBecauseSocketOpen: true,
          skippedBecauseNoToken: false,
          result: null,
        });
        continue;
      }

      const result = await this.pushNotifier.send({
        deviceId: device.id,
        platform: device.platform,
        pushToken: device.pushToken,
        status,
        title,
        body,
        data: {
          type: 'companion_status',
          status,
          ...(subjectDeviceId !== null
            ? { subjectDeviceId }
            : {}),
        },
      });

      if (result.accepted) {
        sent += 1;
      }
      attempted.push({
        deviceId: device.id,
        platform: device.platform,
        skippedBecauseSocketOpen: false,
        skippedBecauseNoToken: false,
        result,
      });
    }

    return { status, attempted, sent };
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new DomainError(`${field} is required`, 'DEVICE_CONTEXT_INVALID');
  }
}
