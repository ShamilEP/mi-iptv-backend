import { DomainError } from '../../domain/shared/domain-error.js';
import { assertParentalPinPolicy } from '../../domain/profiles/parental-pin-policy.js';
import type { AccessTokenService } from '../ports/access-token-service.js';
import type { PasswordHasher } from '../ports/password-hasher.js';
import type { ProfileRepository } from '../ports/profile-repository.js';
import type { ParentalPinThrottle } from './parental-pin-throttle.js';
import { requireOwnedProfile } from './require-owned-profile.js';
import { verifyProfileAccessAccountId } from './verify-profile-access-token.js';

export type VerifyParentalPinInput = {
  readonly accessToken: string;
  readonly profileId: string;
  readonly pin: string;
  readonly clientIp?: string;
};

export type VerifyParentalPinResult = {
  readonly verified: true;
  readonly profileId: string;
};

/**
 * POST verify parental PIN with Redis throttling (BE-037 / FR-023).
 */
export class VerifyParentalPin {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly profiles: ProfileRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly throttle: ParentalPinThrottle,
  ) {}

  async execute(
    input: VerifyParentalPinInput,
  ): Promise<VerifyParentalPinResult> {
    const accountId = verifyProfileAccessAccountId(
      this.accessTokens,
      input.accessToken,
    );
    const profile = await requireOwnedProfile(
      this.profiles,
      accountId,
      input.profileId,
    );

    await this.throttle.assertAllowed(accountId, profile.id);

    if (profile.pinHash === null || profile.pinHash.trim() === '') {
      throw new DomainError(
        'Parental PIN is not configured for this profile',
        'PARENTAL_PIN_NOT_SET',
      );
    }

    const plain = assertParentalPinPolicy(input.pin);
    const ok = await this.passwordHasher.verify(plain, profile.pinHash);
    if (!ok) {
      await this.throttle.recordFailure(accountId, profile.id);
      throw new DomainError(
        'Parental PIN is incorrect',
        'PARENTAL_PIN_INVALID',
      );
    }

    await this.throttle.clearFailures(accountId, profile.id);
    return { verified: true, profileId: profile.id };
  }
}
