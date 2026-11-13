import type { AccessTokenClaims } from '../../domain/auth/access-token-claims.js';
import { AuthTokenError } from '../../domain/auth/auth-token-error.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import type { AccessTokenDenyList } from '../ports/access-token-deny-list.js';
import type { AccessTokenService } from '../ports/access-token-service.js';
import type { RefreshTokenRepository } from '../ports/refresh-token-repository.js';

export type LogoutAccountInput = {
  readonly accessToken: string;
  /** When true, revoke every device session for the account. */
  readonly allSessions?: boolean;
};

export type LogoutAccountResult = {
  readonly status: 'OK';
  readonly scope: 'device' | 'account';
  readonly accountId: string;
  readonly deviceId: string;
};

/**
 * POST /auth/logout — revoke current device (or all sessions) (BE-025).
 * Access JWT `jti` goes on the Redis deny-list; refresh hashes are revoked in DB.
 */
export class LogoutAccount {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly denyList: AccessTokenDenyList,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly accessTokenTtlSeconds: number,
  ) {}

  async execute(input: LogoutAccountInput): Promise<LogoutAccountResult> {
    const clear = input.accessToken.trim();
    if (clear === '') {
      throw new DomainError('accessToken is required', 'AUTH_INPUT_INVALID');
    }

    const claims = this.verifyAccess(clear);
    const nowUnix = Math.floor(Date.now() / 1000);
    const remainingTtl = Math.max(1, claims.expiresAtUnix - nowUnix);
    const allSessions = input.allSessions === true;

    await this.denyList.revokeJti(claims.jti, remainingTtl);

    if (allSessions) {
      await this.denyList.revokeAccountEpoch(
        claims.accountId,
        nowUnix,
        Math.max(1, this.accessTokenTtlSeconds),
      );
      await this.refreshTokens.revokeByAccount(
        claims.accountId,
        'logout_all',
        new Date(),
      );
      return {
        status: 'OK',
        scope: 'account',
        accountId: claims.accountId,
        deviceId: claims.deviceId,
      };
    }

    await this.refreshTokens.revokeByDevice(
      claims.accountId,
      claims.deviceId,
      'logout',
      new Date(),
    );

    return {
      status: 'OK',
      scope: 'device',
      accountId: claims.accountId,
      deviceId: claims.deviceId,
    };
  }

  private verifyAccess(token: string): AccessTokenClaims {
    try {
      return this.accessTokens.verify(token);
    } catch (error: unknown) {
      if (error instanceof AuthTokenError) {
        throw new DomainError(error.message, 'AUTH_ACCESS_INVALID');
      }
      throw new DomainError('Invalid access token', 'AUTH_ACCESS_INVALID');
    }
  }
}
