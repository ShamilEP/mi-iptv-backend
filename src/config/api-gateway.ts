/**
 * API Gateway / BFF knobs (BE-006 / BE-008 / Security §4.1).
 * Env overrides use names only — never hardcode secrets.
 */

/** Security §4.1 — 100 requests per minute per access token. */
export const DEFAULT_API_RATE_LIMIT_MAX_REQUESTS = 100;

/**
 * Stricter budget for unauthenticated `/api/v1` traffic (per client IP).
 * Auth abuse paths still use dedicated login/register guards (SEC-013 / BE-028).
 */
export const DEFAULT_API_RATE_LIMIT_ANONYMOUS_MAX_REQUESTS = 20;

export const DEFAULT_API_RATE_LIMIT_WINDOW_SECONDS = 60;

/** Soft cap on JSON request bodies at the gateway edge. */
export const DEFAULT_MAX_JSON_BODY_BYTES = 1_048_576;

export type ApiGatewayConfig = {
  readonly rateLimitMaxRequests: number;
  readonly rateLimitAnonymousMaxRequests: number;
  readonly rateLimitWindowSeconds: number;
  readonly maxJsonBodyBytes: number;
};

export function loadApiGatewayConfig(
  env: NodeJS.ProcessEnv = process.env,
): ApiGatewayConfig {
  return {
    rateLimitMaxRequests: readPositiveInt(
      env['API_RATE_LIMIT_MAX_REQUESTS'],
      DEFAULT_API_RATE_LIMIT_MAX_REQUESTS,
    ),
    rateLimitAnonymousMaxRequests: readPositiveInt(
      env['API_RATE_LIMIT_ANONYMOUS_MAX_REQUESTS'],
      DEFAULT_API_RATE_LIMIT_ANONYMOUS_MAX_REQUESTS,
    ),
    rateLimitWindowSeconds: readPositiveInt(
      env['API_RATE_LIMIT_WINDOW_SECONDS'],
      DEFAULT_API_RATE_LIMIT_WINDOW_SECONDS,
    ),
    maxJsonBodyBytes: readPositiveInt(
      env['API_MAX_JSON_BODY_BYTES'],
      DEFAULT_MAX_JSON_BODY_BYTES,
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
