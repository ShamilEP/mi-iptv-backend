import { createSign, createVerify, randomUUID } from 'node:crypto';
import type {
  AccessTokenClaims,
  AccessTokenIssueInput,
} from '../../domain/auth/access-token-claims.js';
import {
  assertAccessTokenIssueInput,
  assertJwtAccessAlg,
  assertJwtAudience,
  assertJwtIssuer,
  assertJwtKid,
  parseAccessTokenClaims,
  REQUIRED_ACCESS_TOKEN_ALG,
} from '../../domain/auth/access-token-rules.js';
import { AuthTokenError } from '../../domain/auth/auth-token-error.js';
import type {
  AccessTokenService,
  IssuedAccessToken,
} from '../../application/ports/access-token-service.js';
import type { JwtSigningKeyStore } from '../../application/ports/jwt-signing-key-store.js';
import type { JwtTokenTtlConfig } from '../../config/jwt-tokens.js';

/**
 * RS256 access JWT issuer/verifier using Node `crypto` (no third-party JWT SDK).
 * Claim/alg rules live in domain (`access-token-rules`).
 */
export class NodeRs256AccessTokenService implements AccessTokenService {
  constructor(
    private readonly keys: JwtSigningKeyStore,
    private readonly ttl: JwtTokenTtlConfig,
  ) {}

  issue(input: AccessTokenIssueInput): IssuedAccessToken {
    assertAccessTokenIssueInput(input);

    const signing = this.keys.getActiveSigningKey();
    const now = Math.floor(Date.now() / 1000);
    const exp = now + this.ttl.accessTokenTtlSeconds;
    const jti = randomUUID();

    const header = {
      alg: REQUIRED_ACCESS_TOKEN_ALG,
      typ: 'JWT',
      kid: signing.kid,
    };
    const payload = {
      iss: this.ttl.issuer,
      aud: this.ttl.audience,
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

    // Pin alg before any crypto — rejects none / HS256 / alg confusion (SEC-011).
    assertJwtAccessAlg(header.alg);
    const kid = assertJwtKid(header.kid);
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

    assertJwtIssuer(payload['iss'], this.ttl.issuer);
    assertJwtAudience(payload['aud'], this.ttl.audience);

    return parseAccessTokenClaims({
      accountId: payload['accountId'] ?? payload['sub'],
      deviceId: payload['deviceId'],
      roles: payload['roles'],
      jti: payload['jti'],
      issuedAtUnix: payload['iat'],
      expiresAtUnix: payload['exp'],
      kid,
      nowUnix: Math.floor(Date.now() / 1000),
    });
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
