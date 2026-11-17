import {
  SYNC_STATE_PAGINATION,
} from '../../domain/api/pagination.js';
import { DomainError } from '../../domain/shared/domain-error.js';

export type SyncStateQuery = {
  readonly cursor: number;
  readonly limit: number;
};

/**
 * Parses GET /sync/state query (ADR-005): numeric `cursor` (change_seq).
 * Deprecated alias: numeric `since` maps to the same cursor (not wall-clock time).
 */
export function parseSyncStateQuery(raw: {
  readonly cursor?: unknown;
  readonly since?: unknown;
  readonly limit?: unknown;
}): SyncStateQuery {
  const cursor = parseCursor(raw.cursor, raw.since);
  const limit = parseLimit(raw.limit);
  return { cursor, limit };
}

function parseCursor(cursorRaw: unknown, sinceRaw: unknown): number {
  if (cursorRaw !== undefined && cursorRaw !== null && cursorRaw !== '') {
    return parseNonNegativeInt(cursorRaw, 'cursor');
  }
  if (sinceRaw !== undefined && sinceRaw !== null && sinceRaw !== '') {
    if (typeof sinceRaw === 'string' && sinceRaw.includes('T')) {
      throw new DomainError(
        'since must be a change_seq cursor (integer), not a wall-clock timestamp — use cursor=',
        'SYNC_CURSOR_INVALID',
      );
    }
    return parseNonNegativeInt(sinceRaw, 'since');
  }
  return 0;
}

function parseLimit(raw: unknown): number {
  const limits = SYNC_STATE_PAGINATION;
  if (raw === undefined || raw === null || raw === '') {
    return limits.defaultLimit;
  }
  const parsed = parseNonNegativeInt(raw, 'limit');
  if (parsed < limits.minLimit || parsed > limits.maxLimit) {
    throw new DomainError(
      `limit must be between ${limits.minLimit} and ${limits.maxLimit}`,
      'PAGINATION_LIMIT_INVALID',
    );
  }
  if (parsed < 1) {
    throw new DomainError('limit must be a positive integer', 'PAGINATION_LIMIT_INVALID');
  }
  return parsed;
}

function parseNonNegativeInt(raw: unknown, label: string): number {
  const parsed =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
        ? Number(raw.trim())
        : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new DomainError(
      `${label} must be a non-negative integer`,
      label === 'limit' ? 'PAGINATION_LIMIT_INVALID' : 'SYNC_CURSOR_INVALID',
    );
  }
  return parsed;
}
