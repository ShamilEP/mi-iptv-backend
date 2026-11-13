import { AuthTokenError } from '../../domain/auth/auth-token-error.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import type { AccessTokenService } from '../ports/access-token-service.js';

export function verifyProfileAccessAccountId(
  accessTokens: AccessTokenService,
  accessToken: string,
): string {
  const clear = accessToken.trim();
  if (clear === '') {
    throw new DomainError('accessToken is required', 'AUTH_INPUT_INVALID');
  }
  try {
    return accessTokens.verify(clear).accountId;
  } catch (error: unknown) {
    if (error instanceof AuthTokenError) {
      throw new DomainError(error.message, 'AUTH_ACCESS_INVALID');
    }
    throw new DomainError('Invalid access token', 'AUTH_ACCESS_INVALID');
  }
}
