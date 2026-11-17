import { randomUUID } from 'node:crypto';
import {
  deviceCommandExpiresAt,
  isDeviceCommandAction,
  type DeviceCommandStatus,
} from '../../domain/devices/device-command.js';
import { toServerTimestamp } from '../../domain/api/server-clock.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import type { DeviceCommandRepository } from '../ports/device-command-repository.js';
import type { DeviceRepository } from '../ports/device-repository.js';
import type { DeviceSocketPresence } from '../ports/device-socket-presence.js';
import type { PushNotifier } from '../ports/push-notifier.js';
import type { FanOutDeviceCommand } from '../realtime/fan-out-device-command.js';

export type SendToTvInput = {
  readonly accountId: string;
  /** JWT `deviceId` claim — must match path sender. */
  readonly authenticatedDeviceId: string;
  readonly senderDeviceId: string;
  readonly targetDeviceId: string;
  readonly contentId: string;
  readonly sourceId: string;
  readonly action: string;
};

export type SendToTvResult = {
  readonly commandId: string;
  readonly status: Extract<DeviceCommandStatus, 'queued' | 'delivered'>;
  readonly expiresAt: string;
};

/**
 * POST /devices/{sender}/send-to-tv (BE-080 / ADR-008 / FR-037).
 * Always persists `play`; delivers over Redis Pub/Sub when the TV socket is open;
 * otherwise queues (5 min TTL) and attempts a push wake.
 */
export class SendToTv {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly commands: DeviceCommandRepository,
    private readonly presence: DeviceSocketPresence,
    private readonly fanOut: FanOutDeviceCommand,
    private readonly pushNotifier: PushNotifier,
  ) {}

  async execute(input: SendToTvInput): Promise<SendToTvResult> {
    const accountId = requireNonEmpty(input.accountId, 'accountId');
    const authenticatedDeviceId = requireNonEmpty(
      input.authenticatedDeviceId,
      'authenticatedDeviceId',
    );
    const senderDeviceId = requireNonEmpty(
      input.senderDeviceId,
      'senderDeviceId',
    );
    const targetDeviceId = requireNonEmpty(
      input.targetDeviceId,
      'targetDeviceId',
    );
    const contentId = requireNonEmpty(input.contentId, 'contentId');
    const sourceId = requireNonEmpty(input.sourceId, 'sourceId');

    if (authenticatedDeviceId !== senderDeviceId) {
      throw new DomainError(
        'Path device must match the authenticated device',
        'SEND_TO_TV_SENDER_MISMATCH',
      );
    }
    if (!isDeviceCommandAction(input.action.trim())) {
      throw new DomainError(
        'action must be play',
        'SEND_TO_TV_ACTION_INVALID',
      );
    }

    const sender = await this.devices.findById(accountId, senderDeviceId);
    if (sender === null || sender.revokedAt !== null) {
      throw new DomainError('Sender device not found', 'DEVICE_NOT_FOUND');
    }

    const target = await this.devices.findById(accountId, targetDeviceId);
    if (target === null || target.revokedAt !== null) {
      throw new DomainError('Target device not found', 'DEVICE_NOT_FOUND');
    }
    if (target.deviceType !== 'tv') {
      throw new DomainError(
        'targetDeviceId must be a TV device',
        'SEND_TO_TV_TARGET_NOT_TV',
      );
    }

    const now = new Date();
    await this.commands.markExpiredBefore(now);

    const commandId = randomUUID();
    const expiresAt = deviceCommandExpiresAt(now);
    let stored = await this.commands.insert({
      id: commandId,
      accountId,
      senderDeviceId,
      targetDeviceId,
      command: 'play',
      payload: { contentId, sourceId },
      status: 'queued',
      createdAt: now,
      expiresAt,
    });

    const socketOpen = await this.presence.hasOpenSocket(
      accountId,
      targetDeviceId,
    );

    if (socketOpen) {
      const fanOut = await this.fanOut.execute({
        targetDeviceId,
        payload: {
          type: 'send_to_tv',
          commandId,
          contentId,
          sourceId,
          action: 'play',
          senderDeviceId,
        },
      });
      if (fanOut.subscriberCount > 0) {
        const delivered =
          (await this.commands.markDelivered(accountId, commandId, now)) ??
          stored;
        stored = delivered;
        return {
          commandId: stored.id,
          status: 'delivered',
          expiresAt: toServerTimestamp(stored.expiresAt),
        };
      }
    }

    if (target.pushToken !== null && target.pushToken.length > 0) {
      await this.pushNotifier.send({
        deviceId: target.id,
        platform: target.platform,
        pushToken: target.pushToken,
        status: 'send_to_tv',
        title: 'Play on TV',
        body: 'Open Mi IPTV to play content sent from your companion',
        data: {
          type: 'send_to_tv',
          commandId,
          contentId,
          sourceId,
          action: 'play',
        },
      });
    }

    return {
      commandId: stored.id,
      status: 'queued',
      expiresAt: toServerTimestamp(stored.expiresAt),
    };
  }
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new DomainError(`${field} is required`, 'SEND_TO_TV_FIELDS_INVALID');
  }
  return trimmed;
}
