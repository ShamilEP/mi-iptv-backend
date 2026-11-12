import type { Device } from '../../domain/devices/device.js';

export type NewDevice = Omit<
  Device,
  'pairedAt' | 'lastSeenAt' | 'revokedAt'
> & {
  readonly pairedAt?: Date;
  readonly lastSeenAt?: Date | null;
  readonly revokedAt?: Date | null;
};

export interface DeviceRepository {
  listByAccount(accountId: string): Promise<readonly Device[]>;
  findById(accountId: string, deviceId: string): Promise<Device | null>;
  insert(device: NewDevice): Promise<Device>;
  save(device: Device): Promise<Device>;
}
