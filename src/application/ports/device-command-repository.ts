import type { DeviceCommand } from '../../domain/devices/device-command.js';

export type NewDeviceCommand = Omit<
  DeviceCommand,
  'deliveredAt' | 'ackedAt'
> & {
  readonly deliveredAt?: Date | null;
  readonly ackedAt?: Date | null;
};

export interface DeviceCommandRepository {
  insert(command: NewDeviceCommand): Promise<DeviceCommand>;
  findById(accountId: string, commandId: string): Promise<DeviceCommand | null>;
  /** Non-expired `queued` commands for a TV, oldest first. */
  listPendingForTarget(
    accountId: string,
    targetDeviceId: string,
    now: Date,
  ): Promise<readonly DeviceCommand[]>;
  markDelivered(
    accountId: string,
    commandId: string,
    deliveredAt: Date,
  ): Promise<DeviceCommand | null>;
  markExpiredBefore(now: Date): Promise<number>;
  deleteByAccount(accountId: string): Promise<number>;
}
