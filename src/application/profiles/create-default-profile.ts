import { randomUUID } from 'node:crypto';
import { DomainError } from '../../domain/shared/domain-error.js';
import { buildDefaultProfile } from '../../domain/profiles/default-profile.js';
import type { Profile } from '../../domain/profiles/profile.js';
import type { ProfileRepository } from '../ports/profile-repository.js';

export type CreateDefaultProfileInput = {
  readonly accountId: string;
};

/**
 * Seeds the single MVP default profile after account registration (BE-029).
 * Invoked by POST /auth/register (BE-020); enforces one profile per account in MVP.
 */
export class CreateDefaultProfile {
  constructor(private readonly profiles: ProfileRepository) {}

  async execute(input: CreateDefaultProfileInput): Promise<Profile> {
    const accountId = input.accountId.trim();
    if (accountId === '') {
      throw new DomainError('accountId is required', 'PROFILE_INPUT_INVALID');
    }

    const existing = await this.profiles.listByAccount(accountId);
    if (existing.length > 0) {
      throw new DomainError(
        'Account already has a profile (MVP allows one)',
        'PROFILE_ALREADY_EXISTS',
      );
    }

    return this.profiles.insert(
      buildDefaultProfile(accountId, randomUUID()),
    );
  }
}
