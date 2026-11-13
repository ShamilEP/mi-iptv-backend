import { DomainError } from '../shared/domain-error.js';

export type XmltvParseErrorCode =
  | 'XMLTV_INVALID_INPUT'
  | 'XMLTV_BYTE_LIMIT'
  | 'XMLTV_CHANNEL_LIMIT'
  | 'XMLTV_PROGRAMME_LIMIT'
  | 'XMLTV_LINE_LIMIT'
  | 'XMLTV_TIMEOUT'
  | 'XMLTV_MEMORY_LIMIT'
  | 'XMLTV_FORBIDDEN_DTD'
  | 'XMLTV_PARSE_FAILED';

export class XmltvParseError extends DomainError {
  constructor(
    message: string,
    override readonly code: XmltvParseErrorCode,
  ) {
    super(message, code);
    this.name = 'XmltvParseError';
  }
}
