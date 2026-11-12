import { DomainError } from '../shared/domain-error.js';

export type XtreamErrorCode =
  | 'XTREAM_AUTH_FAILED'
  | 'XTREAM_ACCOUNT_EXPIRED'
  | 'XTREAM_ACCOUNT_BLOCKED'
  | 'XTREAM_INVALID_RESPONSE'
  | 'XTREAM_HTTP_FAILED'
  | 'XTREAM_INVALID_INPUT';

export class XtreamError extends DomainError {
  constructor(
    message: string,
    override readonly code: XtreamErrorCode,
  ) {
    super(message, code);
    this.name = 'XtreamError';
  }
}
