import { DomainError } from '../../domain/shared/domain-error.js';
import {
  isFavoriteAction,
  isFavoriteType,
  type FavoriteType,
} from '../../domain/sync/favorite.js';
import { parseClientEventId } from '../../domain/sync/client-event-id.js';
import { decideFavoriteWrite } from '../../domain/sync/decide-favorite-write.js';
import {
  buildSyncConflictReport,
  type SyncConflictReport,
} from '../../domain/sync/sync-log.js';
import type { SyncResolvedBy } from '../../domain/sync/sync-types.js';
import type { FavoriteSyncRepository } from '../ports/favorite-sync-repository.js';

export type SetFavoriteInput = {
  readonly accountId: string;
  readonly profileId: string;
  readonly deviceId: string;
  readonly clientEventId: string;
  readonly itemId: string;
  readonly action: string;
  readonly syncVersion: number;
  readonly type?: string | null;
  readonly sortOrder?: number | null;
  readonly clientReportedAt?: Date | null;
};

export type SetFavoriteResult = {
  readonly status: 'OK';
  readonly accepted: boolean;
  readonly currentVersion: number;
  readonly serverTimestamp: Date;
  readonly resolvedBy: SyncResolvedBy;
  readonly changeSeq: number | null;
  readonly conflict: SyncConflictReport | null;
};

/**
 * POST /api/v1/sync/favorites (BE-063 / BE-065 / ADR-005 / Backend §2.3).
 */
export class SetFavorite {
  constructor(private readonly repository: FavoriteSyncRepository) {}

  async execute(input: SetFavoriteInput): Promise<SetFavoriteResult> {
    assertNonEmpty(input.accountId, 'accountId');
    assertNonEmpty(input.profileId, 'profileId');
    assertNonEmpty(input.deviceId, 'deviceId');
    assertNonEmpty(input.itemId, 'itemId');

    if (!isFavoriteAction(input.action)) {
      throw new DomainError(
        'action must be add or remove',
        'FAVORITE_ACTION_INVALID',
      );
    }

    const favoriteType = parseOptionalType(input.type);
    const sortOrder = parseOptionalSortOrder(input.sortOrder);

    const clientEventId = parseClientEventId(input.clientEventId);
    const serverNow = new Date();
    const priorEvent = await this.repository.findSyncEvent(
      input.accountId,
      clientEventId,
    );
    const existing = await this.repository.findFavorite(
      input.accountId,
      input.profileId,
      input.itemId,
    );

    const decision = decideFavoriteWrite({
      clientEventId,
      priorEvent,
      existing:
        existing === null ? null : { syncVersion: existing.syncVersion },
      write: {
        action: input.action,
        baseVersion: input.syncVersion,
      },
    });

    if (decision.isReplay && priorEvent !== null) {
      return {
        status: 'OK',
        accepted: decision.accepted,
        currentVersion: decision.resultVersion,
        serverTimestamp: serverNow,
        resolvedBy: decision.resolvedBy,
        changeSeq: priorEvent.changeSeq,
        conflict: buildSyncConflictReport(
          priorEvent.entity,
          priorEvent.operation,
          priorEvent.resolvedBy,
        ),
      };
    }

    const applied = await this.repository.applyFavoriteWrite({
      accountId: input.accountId,
      profileId: input.profileId,
      deviceId: input.deviceId,
      clientEventId,
      itemId: input.itemId,
      action: input.action,
      type: favoriteType,
      sortOrder,
      clientReportedAt: input.clientReportedAt ?? null,
      resolvedBy: decision.resolvedBy,
      operation: decision.operation,
      resultVersion: decision.resultVersion,
      serverNow,
    });

    return {
      status: 'OK',
      accepted: true,
      currentVersion: decision.resultVersion,
      serverTimestamp: serverNow,
      resolvedBy: decision.resolvedBy,
      changeSeq: applied.changeSeq,
      conflict: buildSyncConflictReport(
        applied.syncLog.entity,
        applied.syncLog.operation,
        applied.syncLog.resolvedBy,
      ),
    };
  }
}

function parseOptionalType(value: string | null | undefined): FavoriteType | null {
  if (value === undefined || value === null || value.trim() === '') {
    return null;
  }
  if (!isFavoriteType(value)) {
    throw new DomainError(
      'type must be channel or vod',
      'FAVORITE_TYPE_INVALID',
    );
  }
  return value;
}

function parseOptionalSortOrder(
  value: number | null | undefined,
): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Number.isInteger(value)) {
    throw new DomainError(
      'sortOrder must be an integer',
      'FAVORITE_SORT_ORDER_INVALID',
    );
  }
  return value;
}

function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new DomainError(`${field} is required`, 'SYNC_CONTEXT_INVALID');
  }
}
