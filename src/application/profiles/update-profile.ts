import { AuthTokenError } from '../../domain/auth/auth-token-error.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import type { AccessTokenService } from '../ports/access-token-service.js';
import type { ProfileRepository } from '../ports/profile-repository.js';
import {
  toProfilePublicView,
  type ProfilePublicView,
} from './profile-public-view.js';

export type UpdateProfileInput = {
  readonly accessToken: string;
  readonly name?: string;
  readonly avatar?: string | null;
  readonly language?: string;
  readonly region?: string | null;
  readonly autoplay?: boolean;
  readonly subtitlePrefs?: Readonly<Record<string, unknown>>;
};

/**
 * PATCH /profiles — partial update of onboarding preferences (BE-035 / FR-002).
 * Does not change `isDefault` or parental `restrictions` (Release 1).
 */
export class UpdateProfile {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly profiles: ProfileRepository,
  ) {}

  async execute(input: UpdateProfileInput): Promise<ProfilePublicView> {
    const accountId = this.verifyAccountId(input.accessToken);
    const existing = await this.profiles.findDefaultByAccount(accountId);
    if (existing === null) {
      throw new DomainError('Profile not found', 'PROFILE_NOT_FOUND');
    }

    const name =
      input.name !== undefined ? input.name.trim() : existing.name;
    const language =
      input.language !== undefined
        ? input.language.trim()
        : existing.language;
    if (name === '' || language === '') {
      throw new DomainError(
        'name and language must not be empty',
        'PROFILE_INPUT_INVALID',
      );
    }

    let region = existing.region;
    if (input.region !== undefined) {
      if (input.region === null) {
        region = null;
      } else {
        const trimmed = input.region.trim();
        region = trimmed === '' ? null : trimmed;
      }
    }

    let avatar = existing.avatar;
    if (input.avatar !== undefined) {
      if (input.avatar === null) {
        avatar = null;
      } else {
        const trimmed = input.avatar.trim();
        avatar = trimmed === '' ? null : trimmed;
      }
    }

    const saved = await this.profiles.save({
      ...existing,
      name,
      avatar,
      language,
      region,
      autoplay: input.autoplay ?? existing.autoplay,
      subtitlePrefs: input.subtitlePrefs ?? existing.subtitlePrefs,
      updatedAt: new Date(),
    });

    return toProfilePublicView(saved);
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
