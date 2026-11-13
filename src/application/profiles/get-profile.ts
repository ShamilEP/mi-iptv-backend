import { AuthTokenError } from '../../domain/auth/auth-token-error.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import type { AccessTokenService } from '../ports/access-token-service.js';
import type { ProfileRepository } from '../ports/profile-repository.js';
import {
  toProfilePublicView,
  type ProfilePublicView,
} from './profile-public-view.js';

export type GetProfileInput = {
  readonly accessToken: string;
};

/**
 * GET /profiles — return the MVP single (default) profile (BE-035 / FR-002).
 */
export class GetProfile {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly profiles: ProfileRepository,
  ) {}

  async execute(input: GetProfileInput): Promise<ProfilePublicView> {
    const accountId = this.verifyAccountId(input.accessToken);
    const profile = await this.profiles.findDefaultByAccount(accountId);
    if (profile === null) {
      throw new DomainError('Profile not found', 'PROFILE_NOT_FOUND');
    }
    return toProfilePublicView(profile);
  }

  private verifyAccountId(accessToken: string): string {
    const clear = accessToken.trim();
    if (clear === '') {
      throw new DomainError('accessToken is required', 'AUTH_INPUT_INVALID');
    }
    try {
      return this.accessTokens.verify(clear).accountId;
    } catch (error: unknown) {
      if (error instanceof AuthTokenError) {
        throw new DomainError(error.message, 'AUTH_ACCESS_INVALID');
      }
      throw new DomainError('Invalid access token', 'AUTH_ACCESS_INVALID');
    }
  }
}
