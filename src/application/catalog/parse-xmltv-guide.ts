import type { XmltvParseResult } from '../../domain/catalog/xmltv-guide.js';
import type { XmltvGuideParser } from '../ports/xmltv-guide-parser.js';
import {
  DEFAULT_XMLTV_PARSER_LIMITS,
  type XmltvParserLimits,
} from './xmltv-parser-limits.js';

/**
 * Application entry point for untrusted XMLTV guide parsing (SEC-032).
 */
export class ParseXmltvGuide {
  constructor(
    private readonly parser: XmltvGuideParser,
    private readonly defaultLimits: XmltvParserLimits = DEFAULT_XMLTV_PARSER_LIMITS,
  ) {}

  execute(
    bytes: Uint8Array,
    overrides: Partial<XmltvParserLimits> = {},
  ): Promise<XmltvParseResult> {
    return this.parser.parse(bytes, {
      ...this.defaultLimits,
      ...overrides,
    });
  }
}
