import {
  ACCESS_TOKEN_TTL_DEFAULT_SECONDS,
  ACCESS_TOKEN_TTL_MAX_SECONDS,
  ACCESS_TOKEN_TTL_MIN_SECONDS,
  REFRESH_TOKEN_TTL_DEFAULT_SECONDS,
} from '../domain/auth/access-token-rules.js';

export type JwtTokenTtlConfig = {
  /** Access token lifetime in seconds (ADR-004: 3600). */
  readonly accessTokenTtlSeconds: number;
  /** Refresh token lifetime in seconds (ADR-004: 30 days). */
  readonly refreshTokenTtlSeconds: number;
  /** JWT issuer claim (`iss`). */
  readonly issuer: string;
  /** JWT audience claim (`aud`) — API resource identifier. */
  readonly audience: string;
};

/**
 * Loads JWT TTLs / issuer / audience from env names only (never key material).
 */
export function loadJwtTokenTtlConfig(
  env: NodeJS.ProcessEnv = process.env,
): JwtTokenTtlConfig {
  const accessTokenTtlSeconds = readBoundedInt(
    env['JWT_ACCESS_TTL_SECONDS'],
    ACCESS_TOKEN_TTL_DEFAULT_SECONDS,
    ACCESS_TOKEN_TTL_MIN_SECONDS,
    ACCESS_TOKEN_TTL_MAX_SECONDS,
    'JWT_ACCESS_TTL_SECONDS',
  );
  const refreshTokenTtlSeconds = readPositiveInt(
    env['JWT_REFRESH_TTL_SECONDS'],
    REFRESH_TOKEN_TTL_DEFAULT_SECONDS,
    'JWT_REFRESH_TTL_SECONDS',
  );
  const issuer = (env['JWT_ISSUER'] ?? 'mi-iptv').trim() || 'mi-iptv';
  const audience =
    (env['JWT_AUDIENCE'] ?? 'mi-iptv-api').trim() || 'mi-iptv-api';

  return {
    accessTokenTtlSeconds,
    refreshTokenTtlSeconds,
    issuer,
    audience,
  };
}

function readBoundedInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
  name: string,
): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function readPositiveInt(
  raw: string | undefined,
  fallback: number,
  name: string,
): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}
