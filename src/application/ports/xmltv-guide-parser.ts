import type { XmltvParseResult } from '../../domain/catalog/xmltv-guide.js';
import type { XmltvParserLimits } from '../catalog/xmltv-parser-limits.js';

/**
 * Parses XMLTV guide bytes under strict resource limits (SEC-032).
 * Implementations must isolate untrusted input (worker + caps).
 */
export interface XmltvGuideParser {
  parse(
    bytes: Uint8Array,
    limits?: Partial<XmltvParserLimits>,
  ): Promise<XmltvParseResult>;
}
