/**
 * JSON text-frame protocol for authenticated WSS `/realtime` (BE-077).
 */

export type RealtimeHelloMessage = {
  readonly type: 'hello';
  readonly sessionId: string;
  readonly resumeToken: string;
  readonly deviceChannel: string;
  readonly serverTimestamp: string;
};

export type RealtimeHeartbeatMessage = {
  readonly type: 'heartbeat';
};

export type RealtimePongMessage = {
  readonly type: 'pong';
};

export type RealtimeEventMessage = {
  readonly type: 'event';
  readonly channel: string;
  readonly payload: Readonly<Record<string, unknown>>;
};

export type RealtimeClientMessage =
  | RealtimeHeartbeatMessage
  | { readonly type: 'ping' }
  | RealtimeEventMessage;

export function deviceChannel(deviceId: string): string {
  return `dev:${deviceId}`;
}

export function presenceKey(deviceId: string): string {
  return `presence:${deviceId}`;
}
