/**
 * Access JWT claims (ADR-004 / Security §2.2).
 * Roles are account roles (e.g. user|support|admin).
 */
export type AccessTokenClaims = {
  readonly accountId: string;
  readonly deviceId: string;
  readonly roles: readonly string[];
  /** JWT ID — used for deny-list / logout. */
  readonly jti: string;
  readonly issuedAtUnix: number;
  readonly expiresAtUnix: number;
  readonly kid: string;
};

export type AccessTokenIssueInput = {
  readonly accountId: string;
  readonly deviceId: string;
  readonly roles: readonly string[];
};
