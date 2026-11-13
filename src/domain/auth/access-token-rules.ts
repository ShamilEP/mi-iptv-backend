import type {
  AccessTokenClaims,
  AccessTokenIssueInput,
} from './access-token-claims.js';
import { AuthTokenError } from './auth-token-error.js';

/** Security §2.2 / ADR-004 — access TTL bounds (seconds). */
export const ACCESS_TOKEN_TTL_MIN_SECONDS = 15 * 60;
export const ACCESS_TOKEN_TTL_MAX_SECONDS = 60 * 60;
export const ACCESS_TOKEN_TTL_DEFAULT_SECONDS = 60 * 60;

/** Opaque refresh default lifetime (30 days). */
export const REFRESH_TOKEN_TTL_DEFAULT_SECONDS = 30 * 24 * 60 * 60;

/** Only RS256 is accepted for MVP access JWTs (reject none / alg confusion). */
export const REQUIRED_ACCESS_TOKEN_ALG = 'RS256';

export function isAllowedAccessTokenTtlSeconds(seconds: number): boolean {
  return (
    Number.isInteger(seconds) &&
    seconds >= ACCESS_TOKEN_TTL_MIN_SECONDS &&
    seconds <= ACCESS_TOKEN_TTL_MAX_SECONDS
  );
}

export function assertAccessTokenIssueInput(
  input: AccessTokenIssueInput,
): void {
  assertNonEmpty(input.accountId, 'accountId');
  assertNonEmpty(input.deviceId, 'deviceId');
  if (!Array.isArray(input.roles) || input.roles.length === 0) {
    throw new AuthTokenError(
      'Access token requires at least one role',
      'ACCESS_TOKEN_INVALID',
    );
  }
  for (const role of input.roles) {
    if (typeof role !== 'string' || role.trim() === '') {
      throw new AuthTokenError(
        'Access token roles must be non-empty strings',
        'ACCESS_TOKEN_INVALID',
      );
    }
  }
}

export function assertJwtAccessAlg(alg: string | undefined): void {
  if (alg !== REQUIRED_ACCESS_TOKEN_ALG) {
    throw new AuthTokenError(
      'Access token algorithm must be RS256',
      'ACCESS_TOKEN_INVALID',
    );
  }
}

export function assertJwtKid(kid: string | undefined): string {
  if (kid === undefined || kid.trim() === '') {
    throw new AuthTokenError(
      'Access token kid is required',
      'ACCESS_TOKEN_INVALID',
    );
  }
  return kid;
}

export function assertJwtIssuer(
  iss: unknown,
  expectedIssuer: string,
): void {
  if (typeof iss !== 'string' || iss.trim() === '' || iss !== expectedIssuer) {
    throw new AuthTokenError(
      'Access token issuer is invalid',
      'ACCESS_TOKEN_INVALID',
    );
  }
}

/**
 * Accepts a string `aud` or a non-empty array containing the expected audience.
 */
export function assertJwtAudience(
  aud: unknown,
  expectedAudience: string,
): void {
  if (typeof aud === 'string') {
    if (aud === expectedAudience) {
      return;
    }
  } else if (Array.isArray(aud)) {
    if (
      aud.some(
        (item) => typeof item === 'string' && item === expectedAudience,
      )
    ) {
      return;
    }
  }
  throw new AuthTokenError(
    'Access token audience is invalid',
    'ACCESS_TOKEN_INVALID',
  );
}

export function assertAccessTokenNotExpired(
  expiresAtUnix: number,
  nowUnix: number,
): void {
  if (expiresAtUnix <= nowUnix) {
    throw new AuthTokenError(
      'Access token has expired',
      'ACCESS_TOKEN_EXPIRED',
    );
  }
}

/**
 * Builds verified claims from decoded JWT payload fields (post-signature).
 * Caller must already have validated alg, kid, signature, iss, and aud.
 */
export function parseAccessTokenClaims(input: {
  readonly accountId: unknown;
  readonly deviceId: unknown;
  readonly roles: unknown;
  readonly jti: unknown;
  readonly issuedAtUnix: unknown;
  readonly expiresAtUnix: unknown;
  readonly kid: string;
  readonly nowUnix: number;
}): AccessTokenClaims {
  const issuedAtUnix = asUnix(input.issuedAtUnix);
  const expiresAtUnix = asUnix(input.expiresAtUnix);
  if (issuedAtUnix === null || expiresAtUnix === null) {
    throw new AuthTokenError(
      'Access token time claims are invalid',
      'ACCESS_TOKEN_INVALID',
    );
  }
  assertAccessTokenNotExpired(expiresAtUnix, input.nowUnix);

  const accountId = asNonEmptyString(input.accountId);
  const deviceId = asNonEmptyString(input.deviceId);
  const jti = asNonEmptyString(input.jti);
  const roles = asNonEmptyStringArray(input.roles);
  if (
    accountId === null ||
    deviceId === null ||
    jti === null ||
    roles === null
  ) {
    throw new AuthTokenError(
      'Access token claims are incomplete',
      'ACCESS_TOKEN_INVALID',
    );
  }

  return {
    accountId,
    deviceId,
    roles,
    jti,
    issuedAtUnix,
    expiresAtUnix,
    kid: input.kid,
  };
}

function assertNonEmpty(value: string, field: string): void {
  if (value.trim() === '') {
    throw new AuthTokenError(`${field} is required`, 'ACCESS_TOKEN_INVALID');
  }
}

function asUnix(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.trunc(value);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  return value;
}

function asNonEmptyStringArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  if (!value.every((item) => typeof item === 'string' && item.trim() !== '')) {
    return null;
  }
  return value as string[];
}
