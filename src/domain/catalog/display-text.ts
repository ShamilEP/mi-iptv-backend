/**
 * Normalize channel / title / group labels from third-party playlists (SEC-033).
 * JSON APIs rely on JSON encoding; this strips control / bidi abuse before storage.
 */

export const DISPLAY_TEXT_MAX_LENGTH = 512;

/** Bidi / embedding overrides that can spoof UI labels. */
const BIDI_OVERRIDE_PATTERN = /[\u202A-\u202E\u2066-\u2069]/g;

/** C0/C1 controls except tab / LF / CR. */
const CONTROL_CHARS_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

export function normalizeDisplayText(
  value: string,
  maxLength = DISPLAY_TEXT_MAX_LENGTH,
): string {
  const cleaned = value
    .replace(/\u0000/g, '')
    .replace(BIDI_OVERRIDE_PATTERN, ' ')
    .replace(CONTROL_CHARS_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return cleaned.slice(0, maxLength).trimEnd();
}

export function normalizeOptionalDisplayText(
  value: string | null | undefined,
  maxLength = DISPLAY_TEXT_MAX_LENGTH,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = normalizeDisplayText(value, maxLength);
  return normalized.length > 0 ? normalized : null;
}
