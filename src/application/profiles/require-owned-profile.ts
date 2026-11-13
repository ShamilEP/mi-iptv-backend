import { DomainError } from '../../domain/shared/domain-error.js';
import type { Profile } from '../../domain/profiles/profile.js';
import type { ProfileRepository } from '../ports/profile-repository.js';

/**
 * Ensures profileId belongs to accountId (multi-profile scoping — BE-036 / FR-022).
 */
export async function requireOwnedProfile(
  profiles: ProfileRepository,
  accountId: string,
  profileId: string,
): Promise<Profile> {
  const trimmedAccount = accountId.trim();
  const trimmedProfile = profileId.trim();
  if (trimmedAccount === '' || trimmedProfile === '') {
    throw new DomainError(
      'accountId and profileId are required',
      'PROFILE_INPUT_INVALID',
    );
  }
  const profile = await profiles.findById(trimmedAccount, trimmedProfile);
  if (profile === null) {
    throw new DomainError(
      'Profile not found for this account',
      'PROFILE_NOT_FOUND',
    );
  }
  return profile;
}
