import { DomainError } from '../../domain/shared/domain-error.js';
import {
  emptyParentalRestrictions,
  parseParentalRestrictions,
  type ParentalRestrictions,
} from '../../domain/profiles/parental-restrictions.js';
import type { AccessTokenService } from '../ports/access-token-service.js';
import type { ProfileRepository } from '../ports/profile-repository.js';
import {
  toProfilePublicView,
  type ProfilePublicView,
} from './profile-public-view.js';
import { requireOwnedProfile } from './require-owned-profile.js';
import { verifyProfileAccessAccountId } from './verify-profile-access-token.js';

export type UpdateProfileRestrictionsInput = {
  readonly accessToken: string;
  readonly profileId: string;
  readonly kidMode?: boolean;
  readonly maxRating?: string | null;
  readonly allowedSourceIds?: readonly string[];
  readonly blockedSourceIds?: readonly string[];
};

/**
 * PATCH parental restrictions for a kid/household profile (BE-037 / FR-023).
 */
export class UpdateProfileRestrictions {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly profiles: ProfileRepository,
  ) {}

  async execute(
    input: UpdateProfileRestrictionsInput,
  ): Promise<ProfilePublicView> {
    const accountId = verifyProfileAccessAccountId(
      this.accessTokens,
      input.accessToken,
    );
    const profile = await requireOwnedProfile(
      this.profiles,
      accountId,
      input.profileId,
    );

    const current = parseParentalRestrictions(profile.restrictions);
    const next: ParentalRestrictions = {
      kidMode: input.kidMode ?? current.kidMode,
      maxRating:
        input.maxRating !== undefined
          ? normalizeMaxRating(input.maxRating)
          : current.maxRating,
      allowedSourceIds:
        input.allowedSourceIds !== undefined
          ? normalizeIdList(input.allowedSourceIds)
          : current.allowedSourceIds,
      blockedSourceIds:
        input.blockedSourceIds !== undefined
          ? normalizeIdList(input.blockedSourceIds)
          : current.blockedSourceIds,
    };

    if (
      input.kidMode === undefined &&
      input.maxRating === undefined &&
      input.allowedSourceIds === undefined &&
      input.blockedSourceIds === undefined
    ) {
      throw new DomainError(
        'At least one restriction field is required',
        'PROFILE_INPUT_INVALID',
      );
    }

    const saved = await this.profiles.save({
      ...profile,
      restrictions: { ...emptyParentalRestrictions(), ...next },
      updatedAt: new Date(),
    });
    return toProfilePublicView(saved);
  }
}

function normalizeMaxRating(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim().toUpperCase();
  return trimmed === '' ? null : trimmed;
}

function normalizeIdList(values: readonly string[]): readonly string[] {
  return [
    ...new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  ];
}
