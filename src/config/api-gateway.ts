/**
 * API Gateway / BFF knobs (BE-006 / Security §4.1).
 * Env overrides use names only — never hardcode secrets.
 */

/** Security §4.1 — 100 requests per minute per access token (or IP when anonymous). */
export const DEFAULT_API_RATE_LIMIT_MAX_REQUESTS = 100;
export const DEFAULT_API_RATE_LIMIT_WINDOW_SECONDS = 60;

/** Soft cap on JSON request bodies at the gateway edge. */
export const DEFAULT_MAX_JSON_BODY_BYTES = 1_048_576;

export type ApiGatewayConfig = {
  readonly rateLimitMaxRequests: number;
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
