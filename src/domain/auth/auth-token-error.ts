import { DomainError } from '../shared/domain-error.js';

export type AuthTokenErrorCode =
  | 'ACCESS_TOKEN_INVALID'
  | 'ACCESS_TOKEN_EXPIRED'
  | 'ACCESS_TOKEN_KEY_UNKNOWN'
  | 'REFRESH_TOKEN_INVALID'
  | 'TOKEN_KEYS_MISSING';

export class AuthTokenError extends DomainError {
  constructor(
    message: string,
    override readonly code: AuthTokenErrorCode,
  ) {
    super(message, code);
    this.name = 'AuthTokenError';
  }
}
