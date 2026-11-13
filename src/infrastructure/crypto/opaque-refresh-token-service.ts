import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuthTokenError } from '../../domain/auth/auth-token-error.js';
import type {
  IssuedRefreshToken,
  RefreshTokenIssueInput,
  RefreshTokenService,
} from '../../application/ports/refresh-token-service.js';
import type { JwtTokenTtlConfig } from '../../config/jwt-tokens.js';

/**
 * Opaque refresh tokens: random secret + SHA-256 hash for DB storage.
 * Bound to accountId + deviceId in the issued metadata (ADR-004 / SEC-012).
 * Cleartext is returned once to the client; only `tokenHash` is persisted.
 */
export class OpaqueRefreshTokenService implements RefreshTokenService {
  constructor(private readonly ttl: JwtTokenTtlConfig) {}

  issue(input: RefreshTokenIssueInput): IssuedRefreshToken {
    if (input.accountId.trim() === '' || input.deviceId.trim() === '') {
      throw new AuthTokenError(
        'Refresh token requires accountId and deviceId',
        'REFRESH_TOKEN_INVALID',
      );
    }

    const token = base64Url(randomBytes(32));
    const tokenHash = this.hash(token);
    const expiresInSeconds = this.ttl.refreshTokenTtlSeconds;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const familyId =
      input.familyId !== undefined && input.familyId.trim() !== ''
        ? input.familyId
        : randomUUID();

    return {
      token,
      tokenHash,
      accountId: input.accountId,
      deviceId: input.deviceId,
      familyId,
      expiresAt,
      expiresInSeconds,
    };
  }

  hash(token: string): Uint8Array {
    if (token.trim() === '') {
      throw new AuthTokenError(
        'Refresh token is required',
        'REFRESH_TOKEN_INVALID',
      );
    }
    return createHash('sha256').update(token, 'utf8').digest();
  }
}

function base64Url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}
