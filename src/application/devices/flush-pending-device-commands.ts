import type { DeviceCommandRepository } from '../ports/device-command-repository.js';
import type { FanOutDeviceCommand } from '../realtime/fan-out-device-command.js';

export type FlushPendingDeviceCommandsResult = {
  readonly delivered: number;
  readonly expired: number;
};

/**
 * On TV realtime reconnect, deliver queued send-to-TV `play` commands (ADR-008).
 */
export class FlushPendingDeviceCommands {
  constructor(
    private readonly commands: DeviceCommandRepository,
    private readonly fanOut: FanOutDeviceCommand,
  ) {}

  async execute(
    accountId: string,
    targetDeviceId: string,
  ): Promise<FlushPendingDeviceCommandsResult> {
    const now = new Date();
    const expired = await this.commands.markExpiredBefore(now);
    const pending = await this.commands.listPendingForTarget(
      accountId,
      targetDeviceId,
      now,
    );

    let delivered = 0;
    for (const command of pending) {
      const fanOut = await this.fanOut.execute({
        targetDeviceId,
        payload: {
          type: 'send_to_tv',
          commandId: command.id,
          contentId: command.payload.contentId,
          sourceId: command.payload.sourceId,
          action: 'play',
          senderDeviceId: command.senderDeviceId,
        },
      });
      if (fanOut.subscriberCount > 0) {
        await this.commands.markDelivered(accountId, command.id, now);
        delivered += 1;
      }
    }

    return { delivered, expired };
  }
}
