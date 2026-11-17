import {
  REALTIME_MAX_CONNECTIONS_PER_ACCOUNT,
  REALTIME_MAX_CONNECTIONS_PER_DEVICE,
  REALTIME_PRESENCE_TTL_SECONDS,
  REALTIME_RESUME_TTL_SECONDS,
} from '../domain/realtime/realtime-limits.js';

export type RealtimeGatewayConfig = {
  readonly nodeId: string;
  readonly maxConnectionsPerDevice: number;
  readonly maxConnectionsPerAccount: number;
  readonly presenceTtlSeconds: number;
  readonly resumeTtlSeconds: number;
};

export function loadRealtimeGatewayConfig(
  env: NodeJS.ProcessEnv = process.env,
): RealtimeGatewayConfig {
  return {
    nodeId: env['REALTIME_NODE_ID']?.trim() || 'node-local',
    maxConnectionsPerDevice: readPositiveInt(
      env['REALTIME_MAX_CONNECTIONS_PER_DEVICE'],
      REALTIME_MAX_CONNECTIONS_PER_DEVICE,
    ),
    maxConnectionsPerAccount: readPositiveInt(
      env['REALTIME_MAX_CONNECTIONS_PER_ACCOUNT'],
      REALTIME_MAX_CONNECTIONS_PER_ACCOUNT,
    ),
    presenceTtlSeconds: readPositiveInt(
      env['REALTIME_PRESENCE_TTL_SECONDS'],
      REALTIME_PRESENCE_TTL_SECONDS,
    ),
    resumeTtlSeconds: readPositiveInt(
      env['REALTIME_RESUME_TTL_SECONDS'],
      REALTIME_RESUME_TTL_SECONDS,
    ),
  };
}

function readPositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
}
