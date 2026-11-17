import { DomainError } from '../shared/domain-error.js';

/** Max events accepted in one POST /diagnostics/qoe body (OpenAPI). */
export const QOE_BATCH_MAX_EVENTS = 100;

/**
 * Anonymous session id — UUID shape so Sprint 0 records map to
 * `telemetry.qoe_events.session_id` later (SEC-040).
 */
const ANONYMOUS_SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertQoeBatchSize(eventCount: number): void {
  if (!Number.isInteger(eventCount) || eventCount < 1) {
    throw new DomainError(
      'events must be a non-empty array',
      'QOE_BATCH_INVALID',
    );
  }
  if (eventCount > QOE_BATCH_MAX_EVENTS) {
    throw new DomainError(
      `events must contain at most ${QOE_BATCH_MAX_EVENTS} items`,
      'QOE_BATCH_TOO_LARGE',
    );
  }
}

export function parseAnonymousSessionId(value: string): string {
  const trimmed = value.trim();
  if (!ANONYMOUS_SESSION_ID_PATTERN.test(trimmed)) {
    throw new DomainError(
      'anonymousSessionId must be a UUID',
      'QOE_SESSION_INVALID',
    );
  }
  return trimmed.toLowerCase();
}

export function assertNonNegativeInt(
  value: number | undefined,
  field: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new DomainError(
      `${field} must be a non-negative integer`,
      'QOE_METRIC_INVALID',
    );
  }
  return value;
}

export function assertSourceProvider(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new DomainError(
      'sourceProvider is required',
      'QOE_PROVIDER_INVALID',
    );
  }
  if (trimmed.length > 128) {
    throw new DomainError(
      'sourceProvider is too long',
      'QOE_PROVIDER_INVALID',
    );
  }
  return trimmed;
}
