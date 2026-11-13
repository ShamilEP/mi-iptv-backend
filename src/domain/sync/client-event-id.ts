import { SyncError } from './sync-error.js';

/**
 * UUID v1–v8 shape (RFC 4122 / later drafts). Domain validates format only;
 * uniqueness is enforced by persistence (`app.sync_events` PK).
 */
const CLIENT_EVENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseClientEventId(value: string): string {
  const trimmed = value.trim();
  if (!CLIENT_EVENT_ID_PATTERN.test(trimmed)) {
    throw new SyncError(
      'clientEventId must be a UUID',
      'CLIENT_EVENT_ID_INVALID',
    );
  }
  return trimmed.toLowerCase();
}

export function isClientEventId(value: string): boolean {
  try {
    parseClientEventId(value);
    return true;
  } catch {
    return false;
  }
}
