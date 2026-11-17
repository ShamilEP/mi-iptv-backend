/**
 * Per-device realtime fan-out (ADR-007 / BE-078 `dev:{deviceId}`).
 * Redis Pub/Sub routes commands to whichever BFF node holds the TV socket.
 */
export type RealtimeDeviceBusHandler = (message: string) => void;

export interface RealtimeDeviceBus {
  /** Returns subscriber count that received the message (Redis PUBLISH semantics). */
  publish(deviceId: string, message: string): Promise<number>;
  subscribe(
    deviceId: string,
    handler: RealtimeDeviceBusHandler,
  ): Promise<() => void>;
}
