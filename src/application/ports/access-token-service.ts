import type {
  AccessTokenClaims,
  AccessTokenIssueInput,
} from '../../domain/auth/access-token-claims.js';

export type IssuedAccessToken = {
  readonly token: string;
  readonly expiresInSeconds: number;
  readonly expiresAt: Date;
  readonly claims: AccessTokenClaims;
};

/**
 * Issues and verifies RS256 access JWTs (BE-023).
 * Implementations must never log raw token values.
 */
export interface AccessTokenService {
  issue(input: AccessTokenIssueInput): IssuedAccessToken;
  verify(token: string): AccessTokenClaims;
}
