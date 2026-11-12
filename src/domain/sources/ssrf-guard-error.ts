import { DomainError } from '../shared/domain-error.js';

export type SsrfGuardErrorCode =
  | 'SOURCE_URL_INVALID'
  | 'SOURCE_URL_SCHEME_FORBIDDEN'
  | 'SOURCE_URL_HOST_BLOCKED'
  | 'SOURCE_URL_ADDRESS_BLOCKED'
  | 'SOURCE_URL_DNS_FAILED'
  | 'SOURCE_HTTP_REDIRECT_LIMIT'
  | 'SOURCE_HTTP_RESPONSE_TOO_LARGE'
  | 'SOURCE_HTTP_TIMEOUT'
  | 'SOURCE_HTTP_FAILED';

export class SsrfGuardError extends DomainError {
  constructor(
    message: string,
    override readonly code: SsrfGuardErrorCode,
  ) {
    super(message, code);
    this.name = 'SsrfGuardError';
  }
}
