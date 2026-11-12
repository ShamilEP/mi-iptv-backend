import { DomainError } from '../../domain/shared/domain-error.js';
import type { DeviceRepository } from '../ports/device-repository.js';
import {
  toDevicePublicView,
  type DevicePublicView,
} from './device-public-view.js';

export type DeviceHeartbeatInput = {
  readonly accountId: string;
  readonly deviceId: string;
  readonly pushToken?: string;
};

/**
 * Updates last_seen_at (and optional push token rotation) for an active device.
 */
export class DeviceHeartbeat {
  constructor(private readonly devices: DeviceRepository) {}

  async execute(input: DeviceHeartbeatInput): Promise<DevicePublicView> {
    const existing = await this.devices.findById(
      input.accountId,
      input.deviceId,
    );
    if (existing === null || existing.revokedAt !== null) {
      throw new DomainError('Device not found', 'DEVICE_NOT_FOUND');
    }

    let pushToken = existing.pushToken;
    if (input.pushToken !== undefined) {
      const trimmed = input.pushToken.trim();
      pushToken = trimmed.length > 0 ? trimmed : null;
    }

    const saved = await this.devices.save({
      ...existing,
      pushToken,
      lastSeenAt: new Date(),
    });
    return toDevicePublicView(saved);
  }
}
