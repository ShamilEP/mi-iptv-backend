import type {
  RealtimeDeviceBus,
  RealtimeDeviceBusHandler,
} from '../../application/ports/realtime-device-bus.js';

/**
 * In-process per-device channel fan-out (Sprint 0 stand-in for Redis `dev:{id}`).
 */
export class InMemoryRealtimeDeviceBus implements RealtimeDeviceBus {
  private readonly handlers = new Map<string, Set<RealtimeDeviceBusHandler>>();

  async publish(deviceId: string, message: string): Promise<void> {
    const set = this.handlers.get(deviceId);
    if (!set) {
      return;
    }
    for (const handler of [...set]) {
      handler(message);
    }
  }

  async subscribe(
    deviceId: string,
    handler: RealtimeDeviceBusHandler,
  ): Promise<() => void> {
    const set = this.handlers.get(deviceId) ?? new Set<RealtimeDeviceBusHandler>();
    set.add(handler);
    this.handlers.set(deviceId, set);
    return () => {
      const current = this.handlers.get(deviceId);
      if (!current) {
        return;
      }
      current.delete(handler);
      if (current.size === 0) {
        this.handlers.delete(deviceId);
      }
    };
  }
}
