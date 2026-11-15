import { DomainError } from '../../domain/shared/domain-error.js';
import type { AccessTokenService } from '../ports/access-token-service.js';
import type { ProfileRepository } from '../ports/profile-repository.js';
import type { WatchHistoryRepository } from '../ports/watch-history-repository.js';
import { requireOwnedProfile } from '../profiles/require-owned-profile.js';
import { verifyProfileAccessAccountId } from '../profiles/verify-profile-access-token.js';

export type ClearWatchHistoryInput = {
  readonly accessToken: string;
  readonly profileId: string;
};

export type ClearWatchHistoryResult = {
  readonly cleared: true;
  readonly deletedCount: number;
};

/**
 * DELETE /profiles/{id}/history — wipe history only (not Continue Watching).
 */
export class ClearWatchHistory {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly profiles: ProfileRepository,
    private readonly history: WatchHistoryRepository,
  ) {}

  async execute(
    input: ClearWatchHistoryInput,
  ): Promise<ClearWatchHistoryResult> {
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

    const deletedCount = await this.history.deleteByProfile(
      accountId,
      profile.id,
    );
    return { cleared: true, deletedCount };
  }
}
