import type { DeviceCommand } from '../../domain/devices/device-command.js';
import type {
  DeviceCommandRepository,
  NewDeviceCommand,
} from '../../application/ports/device-command-repository.js';

/**
 * Sprint 0 send-to-TV command queue. Replace with Postgres after `pg` is approved.
 */
export class InMemoryDeviceCommandRepository
  implements DeviceCommandRepository
{
  private readonly byId = new Map<string, DeviceCommand>();

  async insert(command: NewDeviceCommand): Promise<DeviceCommand> {
    const row: DeviceCommand = {
      ...command,
      deliveredAt: command.deliveredAt ?? null,
      ackedAt: command.ackedAt ?? null,
    };
    this.byId.set(row.id, row);
    return row;
  }

  async findById(
    accountId: string,
    commandId: string,
  ): Promise<DeviceCommand | null> {
    const row = this.byId.get(commandId);
    if (!row || row.accountId !== accountId) {
      return null;
    }
    return row;
  }

  async listPendingForTarget(
    accountId: string,
    targetDeviceId: string,
    now: Date,
  ): Promise<readonly DeviceCommand[]> {
    return [...this.byId.values()]
      .filter(
        (row) =>
          row.accountId === accountId &&
          row.targetDeviceId === targetDeviceId &&
          row.status === 'queued' &&
          row.expiresAt.getTime() > now.getTime(),
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async markDelivered(
    accountId: string,
    commandId: string,
    deliveredAt: Date,
  ): Promise<DeviceCommand | null> {
    const row = await this.findById(accountId, commandId);
    if (row === null) {
      return null;
    }
    const next: DeviceCommand = {
      ...row,
      status: 'delivered',
      deliveredAt,
    };
    this.byId.set(next.id, next);
    return next;
  }

  async markExpiredBefore(now: Date): Promise<number> {
    let count = 0;
    for (const [id, row] of this.byId) {
      if (row.status !== 'queued') {
        continue;
      }
      if (row.expiresAt.getTime() >= now.getTime()) {
        continue;
      }
      this.byId.set(id, { ...row, status: 'expired' });
      count += 1;
    }
    return count;
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
