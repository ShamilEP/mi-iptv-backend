/** Hard caps for isolated XMLTV parsing (Security §4.2 / SEC-032). */
export type XmltvParserLimits = {
  readonly maxBytes: number;
  readonly maxChannels: number;
  readonly maxProgrammes: number;
  readonly maxLineLength: number;
  /** Wall-clock / CPU budget for the isolated worker (ms). */
  readonly timeoutMs: number;
  /** Worker old-space ceiling (MB). */
  readonly maxOldGenerationSizeMb: number;
};

export const DEFAULT_XMLTV_PARSER_LIMITS: XmltvParserLimits = {
  maxBytes: 20 * 1024 * 1024,
  maxChannels: 50_000,
  maxProgrammes: 200_000,
  maxLineLength: 16_384,
  timeoutMs: 30_000,
  maxOldGenerationSizeMb: 64,
};
