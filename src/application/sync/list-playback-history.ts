import { DomainError } from '../../domain/shared/domain-error.js';
import type { PlaybackSyncRepository } from '../ports/playback-sync-repository.js';
import type { ProfileRepository } from '../ports/profile-repository.js';
import { requireOwnedProfile } from '../profiles/require-owned-profile.js';

export type PlaybackHistoryItem = {
  readonly contentId: string;
  readonly sourceId: string | null;
  readonly positionSec: number;
  readonly durationSec: number | null;
  readonly completed: boolean;
  readonly syncVersion: number;
  readonly updatedAt: string;
};

/**
 * GET /api/v1/sync/playback-history — progress/history for one profile (BE-036).
 */
export class ListPlaybackHistory {
  constructor(
    private readonly playback: PlaybackSyncRepository,
    private readonly profiles: ProfileRepository,
  ) {}

  async execute(
    accountId: string,
    profileId: string,
  ): Promise<{ readonly items: readonly PlaybackHistoryItem[] }> {
    assertNonEmpty(accountId, 'accountId');
    assertNonEmpty(profileId, 'profileId');
    await requireOwnedProfile(this.profiles, accountId, profileId);

    const rows = await this.playback.listPlaybackByProfile(
      accountId,
      profileId,
    );
    return {
      items: rows
        .filter((row) => row.deletedAt === null)
        .map((row) => ({
          contentId: row.contentId,
          sourceId: row.sourceId,
          positionSec: row.positionSec,
          durationSec: row.durationSec,
          completed: row.completed,
          syncVersion: row.syncVersion,
          updatedAt: row.updatedAt.toISOString(),
        })),
    };
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new DomainError(`${field} is required`, 'SYNC_CONTEXT_INVALID');
  }
}
