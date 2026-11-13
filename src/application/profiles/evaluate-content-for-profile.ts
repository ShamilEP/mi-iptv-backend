import type { ProfileRepository } from '../ports/profile-repository.js';
import {
  evaluateContentAccess,
  type ContentAccessDecision,
  type ContentRestrictionMetadata,
} from '../../domain/profiles/parental-restrictions.js';
import { requireOwnedProfile } from './require-owned-profile.js';

export type EvaluateContentForProfileInput = {
  readonly accountId: string;
  readonly profileId: string;
  readonly content: ContentRestrictionMetadata;
};

/**
 * Application gate for catalog/playback against parental restrictions (BE-037).
 */
export class EvaluateContentForProfile {
  constructor(private readonly profiles: ProfileRepository) {}

  async execute(
    input: EvaluateContentForProfileInput,
  ): Promise<ContentAccessDecision> {
    const profile = await requireOwnedProfile(
      this.profiles,
      input.accountId,
      input.profileId,
    );
    return evaluateContentAccess(profile.restrictions, input.content);
  }
}
