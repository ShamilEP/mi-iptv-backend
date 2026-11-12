import type { M3uParseResult } from '../../domain/catalog/m3u-entry.js';
import type { M3uParserLimits } from '../catalog/m3u-parser-limits.js';

/**
 * Parses M3U playlist bytes into entries under strict resource limits.
 * Implementations should stream and isolate untrusted input (BE-044).
 */
export interface M3uPlaylistParser {
  parse(
    bytes: Uint8Array,
    limits?: Partial<M3uParserLimits>,
  ): Promise<M3uParseResult>;
}
