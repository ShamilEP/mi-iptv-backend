import type { DeviceRepository } from '../ports/device-repository.js';
import {
  toDevicePublicView,
  type DevicePublicView,
} from './device-public-view.js';

export class ListDevices {
  constructor(private readonly devices: DeviceRepository) {}

  async execute(accountId: string): Promise<readonly DevicePublicView[]> {
    const rows = await this.devices.listByAccount(accountId);
    return rows.map(toDevicePublicView);
  }
}
