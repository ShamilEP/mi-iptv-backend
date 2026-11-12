import type { M3uParseResult } from '../../domain/catalog/m3u-entry.js';
import type { M3uPlaylistParser } from '../ports/m3u-playlist-parser.js';
import {
  DEFAULT_M3U_PARSER_LIMITS,
  type M3uParserLimits,
} from './m3u-parser-limits.js';

/**
 * Application entry point for untrusted M3U playlist parsing (BE-044).
 */
export class ParseM3uPlaylist {
  constructor(
    private readonly parser: M3uPlaylistParser,
    private readonly defaultLimits: M3uParserLimits = DEFAULT_M3U_PARSER_LIMITS,
  ) {}

  execute(
    bytes: Uint8Array,
    overrides: Partial<M3uParserLimits> = {},
  ): Promise<M3uParseResult> {
    return this.parser.parse(bytes, {
      ...this.defaultLimits,
      ...overrides,
    });
  }
}
