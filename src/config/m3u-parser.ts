import {
  DEFAULT_M3U_PARSER_LIMITS,
  type M3uParserLimits,
} from '../application/catalog/m3u-parser-limits.js';

export type { M3uParserLimits };

/**
 * Loads M3U parser caps from env (names only — no secrets).
 */
export function loadM3uParserLimits(
  env: NodeJS.ProcessEnv = process.env,
): M3uParserLimits {
  return {
    maxBytes: parseBoundedInt(
      env.M3U_PARSER_MAX_BYTES,
      DEFAULT_M3U_PARSER_LIMITS.maxBytes,
      'M3U_PARSER_MAX_BYTES',
      1_024,
      50 * 1024 * 1024,
    ),
    maxEntries: parseBoundedInt(
      env.M3U_PARSER_MAX_ENTRIES,
      DEFAULT_M3U_PARSER_LIMITS.maxEntries,
      'M3U_PARSER_MAX_ENTRIES',
      1,
      500_000,
    ),
    maxLineLength: parseBoundedInt(
      env.M3U_PARSER_MAX_LINE_LENGTH,
      DEFAULT_M3U_PARSER_LIMITS.maxLineLength,
      'M3U_PARSER_MAX_LINE_LENGTH',
      256,
      65_536,
    ),
    timeoutMs: parseBoundedInt(
      env.M3U_PARSER_TIMEOUT_MS,
      DEFAULT_M3U_PARSER_LIMITS.timeoutMs,
      'M3U_PARSER_TIMEOUT_MS',
      100,
      120_000,
    ),
    maxOldGenerationSizeMb: parseBoundedInt(
      env.M3U_PARSER_MAX_OLD_GEN_MB,
      DEFAULT_M3U_PARSER_LIMITS.maxOldGenerationSizeMb,
      'M3U_PARSER_MAX_OLD_GEN_MB',
      16,
      512,
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
