import { DomainError } from '../../domain/shared/domain-error.js';
import { assertParentalPinPolicy } from '../../domain/profiles/parental-pin-policy.js';
import type { AccessTokenService } from '../ports/access-token-service.js';
import type { PasswordHasher } from '../ports/password-hasher.js';
import type { ProfileRepository } from '../ports/profile-repository.js';
import {
  toProfilePublicView,
  type ProfilePublicView,
} from './profile-public-view.js';
import { requireOwnedProfile } from './require-owned-profile.js';
import { verifyProfileAccessAccountId } from './verify-profile-access-token.js';

export type SetParentalPinInput = {
  readonly accessToken: string;
  readonly profileId: string;
  /** New PIN, or null to clear. */
  readonly pin: string | null;
  /** Required when a PIN is already configured. */
  readonly currentPin?: string;
};

/**
 * PUT/POST parental PIN — store Argon2id hash only (BE-037 / FR-023).
 */
export class SetParentalPin {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly profiles: ProfileRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(input: SetParentalPinInput): Promise<ProfilePublicView> {
    const accountId = verifyProfileAccessAccountId(
      this.accessTokens,
      input.accessToken,
    );
    const profile = await requireOwnedProfile(
      this.profiles,
      accountId,
      input.profileId,
    );

    const hasExisting =
      profile.pinHash !== null && profile.pinHash.trim().length > 0;
    if (hasExisting) {
      const current = input.currentPin?.trim() ?? '';
      if (current === '') {
        throw new DomainError(
          'currentPin is required to change or clear the PIN',
          'PARENTAL_PIN_CURRENT_REQUIRED',
        );
      }
      const ok = await this.passwordHasher.verify(current, profile.pinHash!);
      if (!ok) {
        throw new DomainError(
          'currentPin is incorrect',
          'PARENTAL_PIN_INVALID',
        );
      }
    }

    let pinHash: string | null = null;
    if (input.pin !== null) {
      const plain = assertParentalPinPolicy(input.pin);
      pinHash = await this.passwordHasher.hashOpaque(plain);
    }

    const saved = await this.profiles.save({
      ...profile,
      pinHash,
      updatedAt: new Date(),
    });
    return toProfilePublicView(saved);
  }
}
