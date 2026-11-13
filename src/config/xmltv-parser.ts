import {
  DEFAULT_XMLTV_PARSER_LIMITS,
  type XmltvParserLimits,
} from '../application/catalog/xmltv-parser-limits.js';

export type { XmltvParserLimits };

/**
 * Loads XMLTV parser caps from env (names only — no secrets).
 */
export function loadXmltvParserLimits(
  env: NodeJS.ProcessEnv = process.env,
): XmltvParserLimits {
  return {
    maxBytes: parseBoundedInt(
      env.XMLTV_PARSER_MAX_BYTES,
      DEFAULT_XMLTV_PARSER_LIMITS.maxBytes,
      'XMLTV_PARSER_MAX_BYTES',
      1_024,
      50 * 1024 * 1024,
    ),
    maxChannels: parseBoundedInt(
      env.XMLTV_PARSER_MAX_CHANNELS,
      DEFAULT_XMLTV_PARSER_LIMITS.maxChannels,
      'XMLTV_PARSER_MAX_CHANNELS',
      1,
      200_000,
    ),
    maxProgrammes: parseBoundedInt(
      env.XMLTV_PARSER_MAX_PROGRAMMES,
      DEFAULT_XMLTV_PARSER_LIMITS.maxProgrammes,
      'XMLTV_PARSER_MAX_PROGRAMMES',
      1,
      1_000_000,
    ),
    maxLineLength: parseBoundedInt(
      env.XMLTV_PARSER_MAX_LINE_LENGTH,
      DEFAULT_XMLTV_PARSER_LIMITS.maxLineLength,
      'XMLTV_PARSER_MAX_LINE_LENGTH',
      256,
      65_536,
    ),
    timeoutMs: parseBoundedInt(
      env.XMLTV_PARSER_TIMEOUT_MS,
      DEFAULT_XMLTV_PARSER_LIMITS.timeoutMs,
      'XMLTV_PARSER_TIMEOUT_MS',
      100,
      120_000,
    ),
    maxOldGenerationSizeMb: parseBoundedInt(
      env.XMLTV_PARSER_MAX_OLD_GEN_MB,
      DEFAULT_XMLTV_PARSER_LIMITS.maxOldGenerationSizeMb,
      'XMLTV_PARSER_MAX_OLD_GEN_MB',
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
