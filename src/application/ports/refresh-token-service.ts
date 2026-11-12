export type RefreshTokenIssueInput = {
  readonly accountId: string;
  readonly deviceId: string;
  /** Optional reuse of an existing family on refresh rotation. */
  readonly familyId?: string;
};

export type IssuedRefreshToken = {
  /** Clear token returned to the client once — never store or log. */
  readonly token: string;
  /** SHA-256 digest for `app.refresh_tokens.token_hash`. */
  readonly tokenHash: Uint8Array;
  readonly accountId: string;
  readonly deviceId: string;
  readonly familyId: string;
  readonly expiresAt: Date;
  readonly expiresInSeconds: number;
};

/**
 * Opaque refresh tokens bound to a device (BE-023 / ADR-004).
 * Persistence of `tokenHash` is owned by auth use cases / repositories.
 */
export interface RefreshTokenService {
  issue(input: RefreshTokenIssueInput): IssuedRefreshToken;
  /** Hashes a clear refresh token the same way as issue (for lookup). */
  hash(token: string): Uint8Array;
}
