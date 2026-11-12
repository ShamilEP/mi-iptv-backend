import {
  DEFAULT_SOURCE_HTTP_GUARD_LIMITS,
  type SourceHttpGuardLimits,
} from '../application/sources/source-http-guard-limits.js';

export type { SourceHttpGuardLimits as SourceHttpGuardConfig };

export const DEFAULT_SOURCE_HTTP_GUARD = DEFAULT_SOURCE_HTTP_GUARD_LIMITS;

/**
 * Loads SSRF fetch caps from env (names only — no secrets).
 */
export function loadSourceHttpGuardConfig(
  env: NodeJS.ProcessEnv = process.env,
): SourceHttpGuardLimits {
  return {
    maxRedirects: parseBoundedInt(
      env.SOURCE_HTTP_MAX_REDIRECTS,
      DEFAULT_SOURCE_HTTP_GUARD_LIMITS.maxRedirects,
      'SOURCE_HTTP_MAX_REDIRECTS',
      0,
      10,
    ),
    maxResponseBytes: parseBoundedInt(
      env.SOURCE_HTTP_MAX_RESPONSE_BYTES,
      DEFAULT_SOURCE_HTTP_GUARD_LIMITS.maxResponseBytes,
      'SOURCE_HTTP_MAX_RESPONSE_BYTES',
      1_024,
      20 * 1024 * 1024,
    ),
    timeoutMs: parseBoundedInt(
      env.SOURCE_HTTP_TIMEOUT_MS,
      DEFAULT_SOURCE_HTTP_GUARD_LIMITS.timeoutMs,
      'SOURCE_HTTP_TIMEOUT_MS',
      1_000,
      60_000,
    ),
  };
}

function parseBoundedInt(
  raw: string | undefined,
  fallback: number,
  name: string,
  min: number,
  max: number,
): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid ${name}: expected integer ${min}..${max}`);
  }
  return value;
}
