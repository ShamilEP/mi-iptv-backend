import { randomUUID } from 'node:crypto';
import { DomainError } from '../../domain/shared/domain-error.js';
import type { AccessTokenService } from '../ports/access-token-service.js';
import type { ProfileRepository } from '../ports/profile-repository.js';
import type { WatchHistoryRepository } from '../ports/watch-history-repository.js';
import { requireOwnedProfile } from '../profiles/require-owned-profile.js';
import { verifyProfileAccessAccountId } from '../profiles/verify-profile-access-token.js';
import {
  toWatchHistoryPublicItem,
  type WatchHistoryPublicItem,
} from './watch-history-public-view.js';

export type RecordWatchHistoryInput = {
  readonly accessToken: string;
  readonly profileId: string;
  readonly contentId: string;
  readonly sourceId?: string | null;
  readonly positionSec?: number | null;
  readonly durationSec?: number | null;
  readonly completed?: boolean;
  readonly watchedAt?: Date;
};

/**
 * POST /profiles/{id}/history — append a history entry when privacy allows (BE-105).
 */
export class RecordWatchHistory {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly profiles: ProfileRepository,
    private readonly history: WatchHistoryRepository,
  ) {}

  async execute(
    input: RecordWatchHistoryInput,
  ): Promise<WatchHistoryPublicItem> {
    const accountId = verifyProfileAccessAccountId(
      this.accessTokens,
      input.accessToken,
    );
    assertNonEmpty(input.profileId, 'profileId');
    assertNonEmpty(input.contentId, 'contentId');

    const profile = await requireOwnedProfile(
      this.profiles,
      accountId,
      input.profileId,
    );
    if (!profile.historyEnabled) {
      throw new DomainError(
        'Watch history is disabled for this profile',
        'HISTORY_PRIVACY_DISABLED',
      );
    }

    const positionSec = normalizeNonNegativeInt(input.positionSec, 'positionSec');
    const durationSec = normalizeNonNegativeInt(input.durationSec, 'durationSec');
    const watchedAt = input.watchedAt ?? new Date();

    const saved = await this.history.insert({
      id: randomUUID(),
      profileId: profile.id,
      accountId,
      contentId: input.contentId.trim(),
      sourceId: normalizeOptionalId(input.sourceId),
      positionSec,
      durationSec,
      completed: input.completed === true,
      watchedAt,
    });

    return toWatchHistoryPublicItem(saved);
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new DomainError(`${field} is required`, 'HISTORY_INPUT_INVALID');
  }
}

function normalizeOptionalId(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeNonNegativeInt(
  value: number | null | undefined,
  field: string,
): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new DomainError(
      `${field} must be a non-negative integer`,
      'HISTORY_INPUT_INVALID',
    );
  }
  return value;
}
