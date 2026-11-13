import { DomainError } from '../../domain/shared/domain-error.js';
import type { AccessTokenService } from '../ports/access-token-service.js';
import type { ProfileRepository } from '../ports/profile-repository.js';
import {
  toProfilePublicView,
  type ProfilePublicView,
} from './profile-public-view.js';
import { requireOwnedProfile } from './require-owned-profile.js';
import { verifyProfileAccessAccountId } from './verify-profile-access-token.js';

export type UpdateProfileInput = {
  readonly accessToken: string;
  /** When omitted, updates the account default profile (BE-035 compatibility). */
  readonly profileId?: string;
  readonly name?: string;
  readonly avatar?: string | null;
  readonly language?: string;
  readonly region?: string | null;
  readonly autoplay?: boolean;
  readonly subtitlePrefs?: Readonly<Record<string, unknown>>;
  readonly isDefault?: boolean;
};

/**
 * PATCH /profiles/{id} — partial update; may promote default (BE-036 / FR-022).
 */
export class UpdateProfile {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly profiles: ProfileRepository,
  ) {}

  async execute(input: UpdateProfileInput): Promise<ProfilePublicView> {
    const accountId = verifyProfileAccessAccountId(
      this.accessTokens,
      input.accessToken,
    );

    const existing =
      input.profileId !== undefined && input.profileId.trim() !== ''
        ? await requireOwnedProfile(
            this.profiles,
            accountId,
            input.profileId,
          )
        : await this.profiles.findDefaultByAccount(accountId);
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
      region = normalizeOptionalText(input.region);
    }

    let avatar = existing.avatar;
    if (input.avatar !== undefined) {
      avatar = normalizeOptionalText(input.avatar);
    }

    let isDefault = existing.isDefault;
    if (input.isDefault === true && !existing.isDefault) {
      await clearOtherDefaults(this.profiles, accountId, existing.id);
      isDefault = true;
    } else if (input.isDefault === false && existing.isDefault) {
      throw new DomainError(
        'Cannot unset default without promoting another profile',
        'PROFILE_INPUT_INVALID',
      );
    }

    const saved = await this.profiles.save({
      ...existing,
      name,
      avatar,
      language,
      region,
      isDefault,
      autoplay: input.autoplay ?? existing.autoplay,
      subtitlePrefs: input.subtitlePrefs ?? existing.subtitlePrefs,
      updatedAt: new Date(),
    });

    return toProfilePublicView(saved);
  }
}

async function clearOtherDefaults(
  profiles: ProfileRepository,
  accountId: string,
  keepId: string,
): Promise<void> {
  const now = new Date();
  const rows = await profiles.listByAccount(accountId);
  for (const row of rows) {
    if (row.id === keepId || !row.isDefault) {
      continue;
    }
    await profiles.save({ ...row, isDefault: false, updatedAt: now });
  }
}

function normalizeOptionalText(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
