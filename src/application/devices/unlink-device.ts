import { DomainError } from '../../domain/shared/domain-error.js';
import type { DeviceRepository } from '../ports/device-repository.js';

/**
 * Soft-unlink: sets revoked_at and clears push token (BE-075).
 */
export class UnlinkDevice {
  constructor(private readonly devices: DeviceRepository) {}

  async execute(accountId: string, deviceId: string): Promise<void> {
    const existing = await this.devices.findById(accountId, deviceId);
    if (existing === null || existing.revokedAt !== null) {
      throw new DomainError('Device not found', 'DEVICE_NOT_FOUND');
    }
    await this.devices.save({
      ...existing,
      pushToken: null,
      revokedAt: new Date(),
    });
  }
}
