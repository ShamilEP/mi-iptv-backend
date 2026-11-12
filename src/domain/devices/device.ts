import { DomainError } from '../shared/domain-error.js';

export type DeviceType = 'tv' | 'companion';

export type DevicePlatform = 'android_tv' | 'android' | 'ios';

/**
 * Account-linked client device (Backend §5.1 `devices` / BE-075).
 */
export type Device = {
  readonly id: string;
  readonly accountId: string;
  readonly deviceType: DeviceType;
  readonly platform: DevicePlatform;
  readonly name: string | null;
  readonly model: string | null;
  readonly appVersion: string | null;
  readonly osVersion: string | null;
  readonly pushToken: string | null;
  readonly pairedAt: Date;
  readonly lastSeenAt: Date | null;
  readonly revokedAt: Date | null;
};

export function isDeviceType(value: string): value is DeviceType {
  return value === 'tv' || value === 'companion';
}

export function isDevicePlatform(value: string): value is DevicePlatform {
  return value === 'android_tv' || value === 'android' || value === 'ios';
}

export function assertDeviceTypePlatformPair(
  deviceType: DeviceType,
  platform: DevicePlatform,
): void {
  if (deviceType === 'tv' && platform !== 'android_tv') {
    throw new DomainError(
      'tv devices require platform android_tv',
      'DEVICE_TYPE_PLATFORM_MISMATCH',
    );
  }
  if (
    deviceType === 'companion' &&
    platform !== 'android' &&
    platform !== 'ios'
  ) {
    throw new DomainError(
      'companion devices require platform android or ios',
      'DEVICE_TYPE_PLATFORM_MISMATCH',
    );
  }
}
