import type { AccessTokenClaims } from '../../domain/auth/access-token-claims.js';
import { AuthTokenError } from '../../domain/auth/auth-token-error.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import type { AccessTokenDenyList } from '../ports/access-token-deny-list.js';
import type { AccessTokenService } from '../ports/access-token-service.js';

/**
 * Verifies RS256 signature/claims and Redis deny-list / account epoch (BE-025).
 * Used by logout tests and later auth middleware.
 */
export class AssertAccessTokenActive {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly denyList: AccessTokenDenyList,
  ) {}

  async execute(accessToken: string): Promise<AccessTokenClaims> {
    const clear = accessToken.trim();
    if (clear === '') {
      throw new DomainError('accessToken is required', 'AUTH_INPUT_INVALID');
    }

    let claims: AccessTokenClaims;
    try {
      claims = this.accessTokens.verify(clear);
    } catch (error: unknown) {
      if (error instanceof AuthTokenError) {
        throw new DomainError(error.message, 'AUTH_ACCESS_INVALID');
      }
      throw new DomainError('Invalid access token', 'AUTH_ACCESS_INVALID');
    }

    if (await this.denyList.isJtiRevoked(claims.jti)) {
      throw new DomainError('Access token revoked', 'AUTH_ACCESS_REVOKED');
    }

    if (
      await this.denyList.isAccountEpochRevoked(
        claims.accountId,
        claims.issuedAtUnix,
      )
    ) {
      throw new DomainError('Access token revoked', 'AUTH_ACCESS_REVOKED');
    }

    return claims;
  }
}
