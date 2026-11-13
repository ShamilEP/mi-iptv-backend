import type { AccessTokenService } from '../ports/access-token-service.js';
import type { ProfileRepository } from '../ports/profile-repository.js';
import {
  toProfilePublicView,
  type ProfilePublicView,
} from './profile-public-view.js';
import { verifyProfileAccessAccountId } from './verify-profile-access-token.js';

export type ListProfilesInput = {
  readonly accessToken: string;
};

/**
 * GET /profiles — list all profiles for the account (BE-036 / FR-022).
 */
export class ListProfiles {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly profiles: ProfileRepository,
  ) {}

  async execute(
    input: ListProfilesInput,
  ): Promise<{ readonly items: readonly ProfilePublicView[] }> {
    const accountId = verifyProfileAccessAccountId(
      this.accessTokens,
      input.accessToken,
    );
    const rows = await this.profiles.listByAccount(accountId);
    return { items: rows.map(toProfilePublicView) };
  }
}
