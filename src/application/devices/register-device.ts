import { randomUUID } from 'node:crypto';
import { DomainError } from '../../domain/shared/domain-error.js';
import {
  assertDeviceTypePlatformPair,
  isDevicePlatform,
  isDeviceType,
} from '../../domain/devices/device.js';
import type { DeviceRepository } from '../ports/device-repository.js';
import {
  toDevicePublicView,
  type DevicePublicView,
} from './device-public-view.js';

export type RegisterDeviceInput = {
  readonly accountId: string;
  readonly deviceType: string;
  readonly platform: string;
  readonly name?: string;
  readonly model?: string;
  readonly appVersion?: string;
  readonly osVersion?: string;
  readonly pushToken?: string;
};

export class RegisterDevice {
  constructor(private readonly devices: DeviceRepository) {}

  async execute(input: RegisterDeviceInput): Promise<DevicePublicView> {
    if (!isDeviceType(input.deviceType)) {
      throw new DomainError(
        'deviceType must be tv or companion',
        'DEVICE_TYPE_INVALID',
      );
    }
    if (!isDevicePlatform(input.platform)) {
      throw new DomainError(
        'platform must be android_tv, android, or ios',
        'DEVICE_PLATFORM_INVALID',
      );
    }
    assertDeviceTypePlatformPair(input.deviceType, input.platform);

    const now = new Date();
    const pushToken = normalizeOptional(input.pushToken);
    const created = await this.devices.insert({
      id: randomUUID(),
      accountId: input.accountId,
      deviceType: input.deviceType,
      platform: input.platform,
      name: normalizeOptional(input.name),
      model: normalizeOptional(input.model),
      appVersion: normalizeOptional(input.appVersion),
      osVersion: normalizeOptional(input.osVersion),
      pushToken,
      pairedAt: now,
      lastSeenAt: now,
      revokedAt: null,
    });
    return toDevicePublicView(created);
  }
}

function normalizeOptional(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
