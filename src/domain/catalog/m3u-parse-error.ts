import { DomainError } from '../shared/domain-error.js';

export type M3uParseErrorCode =
  | 'M3U_INVALID_INPUT'
  | 'M3U_BYTE_LIMIT'
  | 'M3U_ENTRY_LIMIT'
  | 'M3U_LINE_LIMIT'
  | 'M3U_TIMEOUT'
  | 'M3U_MEMORY_LIMIT'
  | 'M3U_PARSE_FAILED';

export class M3uParseError extends DomainError {
  constructor(
    message: string,
    override readonly code: M3uParseErrorCode,
  ) {
    super(message, code);
    this.name = 'M3uParseError';
  }
}
