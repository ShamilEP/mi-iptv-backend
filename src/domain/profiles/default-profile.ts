import type { Profile } from './profile.js';

/**
 * MVP default profile seed (BE-029 / SRS §1.2 / schema `app.profiles`).
 * Language placeholder until PRD-012; playback defaults match DB defaults.
 */
export const DEFAULT_PROFILE_NAME = 'Default';
export const DEFAULT_PROFILE_LANGUAGE = 'es';
export const DEFAULT_PROFILE_AUTOPLAY = true;

export type DefaultProfileSeed = Omit<Profile, 'createdAt' | 'updatedAt'> & {
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
};

/**
 * Builds the single MVP profile row for a newly registered account.
 * Callers supply `id` (e.g. crypto.randomUUID) and persist via ProfileRepository.
 */
export function buildDefaultProfile(
  accountId: string,
  profileId: string,
  now: Date = new Date(),
): DefaultProfileSeed {
  const trimmedAccountId = accountId.trim();
  const trimmedProfileId = profileId.trim();
  if (trimmedAccountId === '') {
    throw new Error('accountId is required');
  }
  if (trimmedProfileId === '') {
    throw new Error('profileId is required');
  }
  return {
    id: trimmedProfileId,
    accountId: trimmedAccountId,
    name: DEFAULT_PROFILE_NAME,
    avatar: null,
    language: DEFAULT_PROFILE_LANGUAGE,
    region: null,
    isDefault: true,
    autoplay: DEFAULT_PROFILE_AUTOPLAY,
    subtitlePrefs: {},
    restrictions: {},
    createdAt: now,
    updatedAt: now,
  };
}
