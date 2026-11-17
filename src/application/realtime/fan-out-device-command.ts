import type { RealtimeDeviceBus } from '../ports/realtime-device-bus.js';
import { deviceChannel } from '../../domain/realtime/realtime-protocol.js';

export type FanOutDeviceCommandInput = {
  readonly targetDeviceId: string;
  readonly payload: Readonly<Record<string, unknown>>;
};

export type FanOutDeviceCommandResult = {
  readonly channel: string;
  readonly subscriberCount: number;
};

/**
 * Publish a remote-control / send-to-TV command onto `dev:{targetDeviceId}`.
 * Redis Pub/Sub delivers it to whichever BFF node holds the TV's socket (BE-078).
 */
export class FanOutDeviceCommand {
  constructor(private readonly bus: RealtimeDeviceBus) {}

  async execute(
    input: FanOutDeviceCommandInput,
  ): Promise<FanOutDeviceCommandResult> {
    const channel = deviceChannel(input.targetDeviceId);
    const body = JSON.stringify({
      type: 'event',
      channel,
      payload: input.payload,
    });
    const subscriberCount = await this.bus.publish(
      input.targetDeviceId,
      body,
    );
    return { channel, subscriberCount };
  }
}
