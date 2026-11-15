import { DomainError } from '../../domain/shared/domain-error.js';
import type { AccessTokenService } from '../ports/access-token-service.js';
import type { ProfileRepository } from '../ports/profile-repository.js';
import type { WatchHistoryRepository } from '../ports/watch-history-repository.js';
import { requireOwnedProfile } from '../profiles/require-owned-profile.js';
import { verifyProfileAccessAccountId } from '../profiles/verify-profile-access-token.js';
import {
  toWatchHistoryPublicItem,
  type WatchHistoryListView,
} from './watch-history-public-view.js';

export type ListWatchHistoryInput = {
  readonly accessToken: string;
  readonly profileId: string;
};

/**
 * GET /profiles/{id}/history — history view (BE-105), not Continue Watching.
 * When privacy is off, returns enabled=false and an empty list (rows retained).
 */
export class ListWatchHistory {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly profiles: ProfileRepository,
    private readonly history: WatchHistoryRepository,
  ) {}

  async execute(input: ListWatchHistoryInput): Promise<WatchHistoryListView> {
    const accountId = verifyProfileAccessAccountId(
      this.accessTokens,
      input.accessToken,
    );
    assertNonEmpty(input.profileId, 'profileId');
    const profile = await requireOwnedProfile(
      this.profiles,
      accountId,
      input.profileId,
    );

    if (!profile.historyEnabled) {
      return { historyEnabled: false, items: [] };
    }

    const rows = await this.history.listByProfile(accountId, profile.id);
    return {
      historyEnabled: true,
      items: rows.map(toWatchHistoryPublicItem),
    };
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new DomainError(`${field} is required`, 'HISTORY_INPUT_INVALID');
  }
}
