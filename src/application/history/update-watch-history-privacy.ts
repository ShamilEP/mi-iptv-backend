import { DomainError } from '../../domain/shared/domain-error.js';
import type { AccessTokenService } from '../ports/access-token-service.js';
import type { ProfileRepository } from '../ports/profile-repository.js';
import { requireOwnedProfile } from '../profiles/require-owned-profile.js';
import { verifyProfileAccessAccountId } from '../profiles/verify-profile-access-token.js';

export type UpdateWatchHistoryPrivacyInput = {
  readonly accessToken: string;
  readonly profileId: string;
  readonly historyEnabled: boolean;
};

export type WatchHistoryPrivacyView = {
  readonly profileId: string;
  readonly historyEnabled: boolean;
};

/**
 * GET/PATCH /profiles/{id}/privacy — FR-021 history privacy toggle (BE-105).
 */
export class GetWatchHistoryPrivacy {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly profiles: ProfileRepository,
  ) {}

  async execute(input: {
    readonly accessToken: string;
    readonly profileId: string;
  }): Promise<WatchHistoryPrivacyView> {
    const accountId = verifyProfileAccessAccountId(
      this.accessTokens,
      input.accessToken,
    );
    if (input.profileId.trim().length === 0) {
      throw new DomainError('profileId is required', 'HISTORY_INPUT_INVALID');
    }
    const profile = await requireOwnedProfile(
      this.profiles,
      accountId,
      input.profileId,
    );
    return {
      profileId: profile.id,
      historyEnabled: profile.historyEnabled,
    };
  }
}

export class UpdateWatchHistoryPrivacy {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly profiles: ProfileRepository,
  ) {}

  async execute(
    input: UpdateWatchHistoryPrivacyInput,
  ): Promise<WatchHistoryPrivacyView> {
    const accountId = verifyProfileAccessAccountId(
      this.accessTokens,
      input.accessToken,
    );
    if (input.profileId.trim().length === 0) {
      throw new DomainError('profileId is required', 'HISTORY_INPUT_INVALID');
    }
    if (typeof input.historyEnabled !== 'boolean') {
      throw new DomainError(
        'historyEnabled must be a boolean',
        'HISTORY_INPUT_INVALID',
      );
    }

    const profile = await requireOwnedProfile(
      this.profiles,
      accountId,
      input.profileId,
    );
    const saved = await this.profiles.save({
      ...profile,
      historyEnabled: input.historyEnabled,
      updatedAt: new Date(),
    });

    return {
      profileId: saved.id,
      historyEnabled: saved.historyEnabled,
    };
  }
}
