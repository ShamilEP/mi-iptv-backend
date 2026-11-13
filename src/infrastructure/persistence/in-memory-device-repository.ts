import type { Device } from '../../domain/devices/device.js';
import type {
  DeviceRepository,
  NewDevice,
} from '../../application/ports/device-repository.js';

/**
 * Sprint 0 device registry store. Replace with a Postgres adapter after `pg` is approved.
 */
export class InMemoryDeviceRepository implements DeviceRepository {
  private readonly byId = new Map<string, Device>();

  async listByAccount(accountId: string): Promise<readonly Device[]> {
    return [...this.byId.values()]
      .filter((row) => row.accountId === accountId && row.revokedAt === null)
      .sort(
        (a, b) =>
          (b.lastSeenAt?.getTime() ?? 0) - (a.lastSeenAt?.getTime() ?? 0) ||
          a.pairedAt.getTime() - b.pairedAt.getTime(),
      );
  }

  async listAllByAccount(accountId: string): Promise<readonly Device[]> {
    return [...this.byId.values()]
      .filter((row) => row.accountId === accountId)
      .sort(
        (a, b) =>
          (b.lastSeenAt?.getTime() ?? 0) - (a.lastSeenAt?.getTime() ?? 0) ||
          a.pairedAt.getTime() - b.pairedAt.getTime(),
      );
  }

  async findById(accountId: string, deviceId: string): Promise<Device | null> {
    const row = this.byId.get(deviceId);
    if (!row || row.accountId !== accountId) {
      return null;
    }
    return row;
  }

  async insert(device: NewDevice): Promise<Device> {
    const now = new Date();
    const row: Device = {
      ...device,
      pairedAt: device.pairedAt ?? now,
      lastSeenAt: device.lastSeenAt ?? now,
      revokedAt: device.revokedAt ?? null,
    };
    this.byId.set(row.id, row);
    return row;
  }

  async save(device: Device): Promise<Device> {
    this.byId.set(device.id, device);
    return device;
  }

  async deleteByAccount(accountId: string): Promise<number> {
    let count = 0;
    for (const [id, row] of this.byId) {
      if (row.accountId !== accountId) {
        continue;
      }
      this.byId.delete(id);
      count += 1;
    }
    return count;
  }
}
