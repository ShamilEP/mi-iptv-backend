/** Hard caps for isolated M3U parsing (Security §4.2 / BE-044). */
export type M3uParserLimits = {
  readonly maxBytes: number;
  readonly maxEntries: number;
  readonly maxLineLength: number;
  readonly timeoutMs: number;
  /** Worker old-space ceiling (MB). */
  readonly maxOldGenerationSizeMb: number;
};

export const DEFAULT_M3U_PARSER_LIMITS: M3uParserLimits = {
  maxBytes: 20 * 1024 * 1024,
  maxEntries: 100_000,
  maxLineLength: 16_384,
  timeoutMs: 30_000,
  maxOldGenerationSizeMb: 64,
};
