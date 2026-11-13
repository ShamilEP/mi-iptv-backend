import { randomUUID } from 'node:crypto';
import { DomainError } from '../../domain/shared/domain-error.js';
import {
  DEFAULT_PROFILE_AUTOPLAY,
  DEFAULT_PROFILE_LANGUAGE,
} from '../../domain/profiles/default-profile.js';
import { MAX_PROFILES_PER_ACCOUNT } from '../../domain/profiles/profile-limits.js';
import type { AccessTokenService } from '../ports/access-token-service.js';
import type { ProfileRepository } from '../ports/profile-repository.js';
import {
  toProfilePublicView,
  type ProfilePublicView,
} from './profile-public-view.js';
import { verifyProfileAccessAccountId } from './verify-profile-access-token.js';

export type CreateProfileInput = {
  readonly accessToken: string;
  readonly name: string;
  readonly avatar?: string | null;
  readonly language?: string;
  readonly region?: string | null;
  readonly autoplay?: boolean;
  readonly subtitlePrefs?: Readonly<Record<string, unknown>>;
  readonly isDefault?: boolean;
};

/**
 * POST /profiles — create an additional profile up to the household limit (BE-036).
 */
export class CreateProfile {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly profiles: ProfileRepository,
  ) {}

  async execute(input: CreateProfileInput): Promise<ProfilePublicView> {
    const accountId = verifyProfileAccessAccountId(
      this.accessTokens,
      input.accessToken,
    );
    const name = input.name.trim();
    if (name === '') {
      throw new DomainError('name is required', 'PROFILE_INPUT_INVALID');
    }

    const language = (input.language ?? DEFAULT_PROFILE_LANGUAGE).trim();
    if (language === '') {
      throw new DomainError('language must not be empty', 'PROFILE_INPUT_INVALID');
    }

    const existing = await this.profiles.listByAccount(accountId);
    if (existing.length >= MAX_PROFILES_PER_ACCOUNT) {
      throw new DomainError(
        `Account may have at most ${MAX_PROFILES_PER_ACCOUNT} profiles`,
        'PROFILE_LIMIT_REACHED',
      );
    }

    const makeDefault =
      input.isDefault === true || existing.length === 0;
    if (makeDefault) {
      await clearDefaults(this.profiles, existing);
    }

    const now = new Date();
    const saved = await this.profiles.insert({
      id: randomUUID(),
      accountId,
      name,
      avatar: normalizeOptionalText(input.avatar),
      language,
      region: normalizeOptionalText(input.region),
      isDefault: makeDefault,
      autoplay: input.autoplay ?? DEFAULT_PROFILE_AUTOPLAY,
      subtitlePrefs: input.subtitlePrefs ?? {},
      restrictions: {},
      pinHash: null,
      createdAt: now,
      updatedAt: now,
    });

    return toProfilePublicView(saved);
  }
}

async function clearDefaults(
  profiles: ProfileRepository,
  rows: readonly { readonly id: string; readonly accountId: string }[],
): Promise<void> {
  const now = new Date();
  for (const row of rows) {
    const full = await profiles.findById(row.accountId, row.id);
    if (full === null || !full.isDefault) {
      continue;
    }
    await profiles.save({ ...full, isDefault: false, updatedAt: now });
  }
}

function normalizeOptionalText(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
