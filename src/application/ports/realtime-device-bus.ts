/**
 * Per-device realtime fan-out (ADR-007 `dev:{deviceId}`).
 * In-process for Sprint 0; Redis Pub/Sub adapter can replace later.
 */
export type RealtimeDeviceBusHandler = (message: string) => void;

export interface RealtimeDeviceBus {
  publish(deviceId: string, message: string): Promise<void>;
  subscribe(
    deviceId: string,
    handler: RealtimeDeviceBusHandler,
  ): Promise<() => void>;
}
