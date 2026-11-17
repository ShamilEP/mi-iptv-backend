import type { DeviceRepository } from '../ports/device-repository.js';
import type { DeviceSocketPresence } from '../ports/device-socket-presence.js';
import {
  toDevicePublicView,
  type DevicePublicView,
} from './device-public-view.js';

export class ListDevices {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly presence: DeviceSocketPresence,
  ) {}

  async execute(accountId: string): Promise<readonly DevicePublicView[]> {
    const rows = await this.devices.listByAccount(accountId);
    const statuses = await this.presence.getConnectionStatuses(
      accountId,
      rows.map((row) => row.id),
    );
    return rows.map((device) =>
      toDevicePublicView(device, statuses.get(device.id) ?? 'offline'),
    );
  }
}
