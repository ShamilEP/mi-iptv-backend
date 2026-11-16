import { DomainError } from '../shared/domain-error.js';

export type PaginationLimits = {
  readonly defaultLimit: number;
  readonly minLimit: number;
  readonly maxLimit: number;
};

export type PaginationQuery = {
  readonly cursor: string | null;
  readonly limit: number;
};

export type CursorPage<T> = {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
};

export const CATALOG_PAGINATION: PaginationLimits = {
  defaultLimit: 50,
  minLimit: 1,
  maxLimit: 200,
};

export const SEARCH_PAGINATION: PaginationLimits = {
  defaultLimit: 20,
  minLimit: 1,
  maxLimit: 100,
};

export const SYNC_STATE_PAGINATION: PaginationLimits = {
  defaultLimit: 500,
  minLimit: 1,
  maxLimit: 500,
};

/**
 * Parses cursor/limit query values for list endpoints (BE-005).
 * Empty or missing cursor means “start of collection”.
 */
export function parsePaginationQuery(
  raw: {
    readonly cursor?: unknown;
    readonly limit?: unknown;
  },
  limits: PaginationLimits,
): PaginationQuery {
  const cursor = normalizeCursor(raw.cursor);
  const limit = normalizeLimit(raw.limit, limits);
  return { cursor, limit };
}

export function buildCursorPage<T>(
  items: readonly T[],
  nextCursor: string | null,
): CursorPage<T> {
  return { items, nextCursor };
}

function normalizeCursor(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new DomainError('cursor must be a string', 'PAGINATION_CURSOR_INVALID');
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeLimit(
  value: unknown,
  limits: PaginationLimits,
): number {
  if (value === undefined || value === null || value === '') {
    return limits.defaultLimit;
  }
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;
  if (!Number.isInteger(parsed)) {
    throw new DomainError('limit must be an integer', 'PAGINATION_LIMIT_INVALID');
  }
  if (parsed < limits.minLimit || parsed > limits.maxLimit) {
    throw new DomainError(
      `limit must be between ${limits.minLimit} and ${limits.maxLimit}`,
      'PAGINATION_LIMIT_INVALID',
    );
  }
  return parsed;
}
