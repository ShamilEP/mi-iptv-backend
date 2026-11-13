import { DomainError } from '../../domain/shared/domain-error.js';
import type { AccessTokenService } from '../ports/access-token-service.js';
import type { ProfileRepository } from '../ports/profile-repository.js';
import {
  toProfilePublicView,
  type ProfilePublicView,
} from './profile-public-view.js';
import { requireOwnedProfile } from './require-owned-profile.js';
import { verifyProfileAccessAccountId } from './verify-profile-access-token.js';

export type GetProfileInput = {
  readonly accessToken: string;
  /** When omitted, returns the account default profile (BE-035 compatibility). */
  readonly profileId?: string;
};

/**
 * GET /profiles/{id} or default profile when id omitted (BE-035 / BE-036).
 */
export class GetProfile {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly profiles: ProfileRepository,
  ) {}

  async execute(input: GetProfileInput): Promise<ProfilePublicView> {
    const accountId = verifyProfileAccessAccountId(
      this.accessTokens,
      input.accessToken,
    );

    if (input.profileId !== undefined && input.profileId.trim() !== '') {
      const profile = await requireOwnedProfile(
        this.profiles,
        accountId,
        input.profileId,
      );
      return toProfilePublicView(profile);
    }

    const profile = await this.profiles.findDefaultByAccount(accountId);
    if (profile === null) {
      throw new DomainError('Profile not found', 'PROFILE_NOT_FOUND');
    }
    return toProfilePublicView(profile);
  }
}
