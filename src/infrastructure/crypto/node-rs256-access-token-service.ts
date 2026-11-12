import { createSign, createVerify, randomUUID } from 'node:crypto';
import type {
  AccessTokenClaims,
  AccessTokenIssueInput,
} from '../../domain/auth/access-token-claims.js';
import { AuthTokenError } from '../../domain/auth/auth-token-error.js';
import type {
  AccessTokenService,
  IssuedAccessToken,
} from '../../application/ports/access-token-service.js';
import type { JwtSigningKeyStore } from '../../application/ports/jwt-signing-key-store.js';
import type { JwtTokenTtlConfig } from '../../config/jwt-tokens.js';

/**
 * RS256 access JWT issuer/verifier using Node `crypto` (no third-party JWT SDK).
 */
export class NodeRs256AccessTokenService implements AccessTokenService {
  constructor(
    private readonly keys: JwtSigningKeyStore,
    private readonly ttl: JwtTokenTtlConfig,
  ) {}

  issue(input: AccessTokenIssueInput): IssuedAccessToken {
    assertNonEmpty(input.accountId, 'accountId');
    assertNonEmpty(input.deviceId, 'deviceId');
    if (input.roles.length === 0) {
      throw new AuthTokenError(
        'Access token requires at least one role',
        'ACCESS_TOKEN_INVALID',
      );
    }

    const signing = this.keys.getActiveSigningKey();
    const now = Math.floor(Date.now() / 1000);
    const exp = now + this.ttl.accessTokenTtlSeconds;
    const jti = randomUUID();

    const header = {
      alg: 'RS256',
      typ: 'JWT',
      kid: signing.kid,
    };
    const payload = {
      iss: this.ttl.issuer,
      sub: input.accountId,
      accountId: input.accountId,
      deviceId: input.deviceId,
      roles: [...input.roles],
      jti,
      iat: now,
      exp,
    };

    const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
    const signer = createSign('RSA-SHA256');
    signer.update(signingInput);
    signer.end();
    const signature = signer.sign(signing.privateKeyPem);
    const token = `${signingInput}.${base64Url(signature)}`;

    const claims: AccessTokenClaims = {
      accountId: input.accountId,
      deviceId: input.deviceId,
      roles: [...input.roles],
      jti,
      issuedAtUnix: now,
      expiresAtUnix: exp,
      kid: signing.kid,
    };

    return {
      token,
      expiresInSeconds: this.ttl.accessTokenTtlSeconds,
      expiresAt: new Date(exp * 1000),
      claims,
    };
  }

  verify(token: string): AccessTokenClaims {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new AuthTokenError(
        'Access token format is invalid',
        'ACCESS_TOKEN_INVALID',
      );
    }
    const [headerB64, payloadB64, signatureB64] = parts as [
      string,
      string,
      string,
    ];

    let header: { alg?: string; kid?: string; typ?: string };
    let payload: Record<string, unknown>;
    try {
      header = JSON.parse(base64UrlDecodeToString(headerB64)) as {
        alg?: string;
        kid?: string;
        typ?: string;
      };
      payload = JSON.parse(base64UrlDecodeToString(payloadB64)) as Record<
        string,
        unknown
      >;
    } catch {
      throw new AuthTokenError(
        'Access token encoding is invalid',
        'ACCESS_TOKEN_INVALID',
      );
    }

    if (header.alg !== 'RS256') {
      throw new AuthTokenError(
        'Access token algorithm must be RS256',
        'ACCESS_TOKEN_INVALID',
      );
    }
    const kid = header.kid;
    if (kid === undefined || kid.trim() === '') {
      throw new AuthTokenError(
        'Access token kid is required',
        'ACCESS_TOKEN_INVALID',
      );
    }
    const publicKeyPem = this.keys.getPublicKeyPem(kid);
    if (publicKeyPem === null) {
      throw new AuthTokenError(
        'Access token signing key is unknown',
        'ACCESS_TOKEN_KEY_UNKNOWN',
      );
    }

    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${headerB64}.${payloadB64}`);
    verifier.end();
    let ok = false;
    try {
      ok = verifier.verify(publicKeyPem, base64UrlDecodeToBuffer(signatureB64));
    } catch {
      ok = false;
    }
    if (!ok) {
      throw new AuthTokenError(
        'Access token signature is invalid',
        'ACCESS_TOKEN_INVALID',
      );
    }

    const exp = asUnix(payload['exp']);
    const iat = asUnix(payload['iat']);
    const now = Math.floor(Date.now() / 1000);
    if (exp === null || iat === null) {
      throw new AuthTokenError(
        'Access token time claims are invalid',
        'ACCESS_TOKEN_INVALID',
      );
    }
    if (exp <= now) {
      throw new AuthTokenError(
        'Access token has expired',
        'ACCESS_TOKEN_EXPIRED',
      );
    }

    const accountId = asNonEmptyString(payload['accountId'] ?? payload['sub']);
    const deviceId = asNonEmptyString(payload['deviceId']);
    const jti = asNonEmptyString(payload['jti']);
    const roles = asStringArray(payload['roles']);
    if (
      accountId === null ||
      deviceId === null ||
      jti === null ||
      roles === null ||
      roles.length === 0
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
      issuedAtUnix: iat,
      expiresAtUnix: exp,
      kid,
    };
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (value.trim() === '') {
    throw new AuthTokenError(
      `${field} is required`,
      'ACCESS_TOKEN_INVALID',
    );
  }
}

function base64UrlJson(value: unknown): string {
  return base64Url(Buffer.from(JSON.stringify(value), 'utf8'));
}

function base64Url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecodeToBuffer(value: string): Buffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (padded.length % 4)) % 4;
  return Buffer.from(`${padded}${'='.repeat(padLength)}`, 'base64');
}

function base64UrlDecodeToString(value: string): string {
  return base64UrlDecodeToBuffer(value).toString('utf8');
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

function asStringArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  if (!value.every((item) => typeof item === 'string' && item.trim() !== '')) {
    return null;
  }
  return value as string[];
}
