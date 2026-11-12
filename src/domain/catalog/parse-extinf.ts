/**
 * Parse an `#EXTINF:` line into duration, display title, and IPTV attributes.
 * Tolerates missing/malformed attributes (returns nulls) — caller decides skips.
 */

const ATTR_PATTERN =
  /(tvg-id|tvg-name|tvg-logo|group-title)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))/gi;

export type ExtInfAttributes = {
  readonly tvgId: string | null;
  readonly tvgName: string | null;
  readonly tvgLogo: string | null;
  readonly groupTitle: string | null;
  readonly title: string;
  readonly durationSec: number | null;
};

export function parseExtInfLine(line: string): ExtInfAttributes | null {
  const trimmed = line.trim();
  if (!trimmed.toUpperCase().startsWith('#EXTINF:')) {
    return null;
  }

  const payload = trimmed.slice('#EXTINF:'.length).trim();
  if (payload.length === 0) {
    return null;
  }

  const commaIndex = findTitleSeparator(payload);
  const meta = commaIndex >= 0 ? payload.slice(0, commaIndex) : payload;
  const title = commaIndex >= 0 ? payload.slice(commaIndex + 1).trim() : '';

  const durationSec = parseDuration(meta);
  const attrs = extractAttributes(meta);

  return {
    tvgId: attrs['tvg-id'] ?? null,
    tvgName: attrs['tvg-name'] ?? null,
    tvgLogo: attrs['tvg-logo'] ?? null,
    groupTitle: attrs['group-title'] ?? null,
    title: title.length > 0 ? title : (attrs['tvg-name'] ?? 'Untitled'),
    durationSec,
  };
}

function findTitleSeparator(payload: string): number {
  let inDouble = false;
  let inSingle = false;
  for (let i = 0; i < payload.length; i += 1) {
    const ch = payload[i];
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === ',' && !inDouble && !inSingle) {
      return i;
    }
  }
  return -1;
}

function parseDuration(meta: string): number | null {
  const match = meta.match(/^(-?\d+(?:\.\d+)?)/);
  if (!match?.[1]) {
    return null;
  }
  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.trunc(value);
}

function extractAttributes(meta: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  ATTR_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_PATTERN.exec(meta)) !== null) {
    const key = match[1]?.toLowerCase();
    if (!key) {
      continue;
    }
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[key] = value.trim();
  }
  return attrs;
}
