/**
 * Server-clock helpers for API timestamps (BE-005 / Backend §3.1).
 * Conflict resolution and LWW must use these (or DB `clock_timestamp()`),
 * never a client-supplied wall clock.
 */

/** Authoritative “now” in UTC. */
export function serverNowUtc(now: () => Date = () => new Date()): Date {
  return now();
}

/** ISO-8601 UTC string for JSON `format: date-time` fields (`serverTimestamp`). */
export function toServerTimestamp(date: Date): string {
  return date.toISOString();
}

export function serverTimestampNow(
  now: () => Date = () => new Date(),
): string {
  return toServerTimestamp(serverNowUtc(now));
}
