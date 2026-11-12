import { XtreamError } from './xtream-error.js';

export type XtreamStreamKind = 'live' | 'movie' | 'series';

/**
 * Builds Xtream playable stream URLs.
 * Path shape: `{base}/{live|movie|series}/{user}/{pass}/{id}.{ext}`
 * Callers must never log the returned URL (contains credentials).
 */
export function buildXtreamStreamUrl(input: {
  readonly baseUrl: string;
  readonly username: string;
  readonly password: string;
  readonly kind: XtreamStreamKind;
  readonly streamId: string | number;
  readonly extension?: string | null;
}): string {
  const base = normalizeXtreamBaseUrl(input.baseUrl);
  const user = encodeURIComponent(input.username);
  const pass = encodeURIComponent(input.password);
  const id = String(input.streamId).trim();
  if (id.length === 0) {
    throw new XtreamError(
      'Xtream stream id is required',
      'XTREAM_INVALID_INPUT',
    );
  }
  const ext = normalizeExtension(input.extension, input.kind);
  return `${base}/${input.kind}/${user}/${pass}/${id}.${ext}`;
}

export function normalizeXtreamBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new XtreamError(
      'Xtream base URL is required',
      'XTREAM_INVALID_INPUT',
    );
  }
  let href = trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new XtreamError(
        'Xtream base URL must be http or https',
        'XTREAM_INVALID_INPUT',
      );
    }
    // Drop player_api.php if callers pasted a full API URL as base.
    if (url.pathname.toLowerCase().endsWith('/player_api.php')) {
      url.pathname = url.pathname.slice(0, -'/player_api.php'.length) || '/';
    }
    url.search = '';
    url.hash = '';
    href = url.toString();
  } catch (error: unknown) {
    if (error instanceof XtreamError) {
      throw error;
    }
    throw new XtreamError('Xtream base URL is invalid', 'XTREAM_INVALID_INPUT');
  }
  return href.replace(/\/+$/, '');
}

export function buildXtreamPlayerApiUrl(input: {
  readonly baseUrl: string;
  readonly username: string;
  readonly password: string;
  readonly action?: string;
  readonly extraParams?: Readonly<Record<string, string>>;
}): string {
  const base = normalizeXtreamBaseUrl(input.baseUrl);
  const url = new URL(`${base}/player_api.php`);
  url.searchParams.set('username', input.username);
  url.searchParams.set('password', input.password);
  if (input.action !== undefined && input.action.length > 0) {
    url.searchParams.set('action', input.action);
  }
  if (input.extraParams !== undefined) {
    for (const [key, value] of Object.entries(input.extraParams)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function normalizeExtension(
  extension: string | null | undefined,
  kind: XtreamStreamKind,
): string {
  const raw = extension?.trim().replace(/^\./, '').toLowerCase();
  if (raw && /^[a-z0-9]+$/.test(raw)) {
    return raw;
  }
  return kind === 'live' ? 'ts' : 'mp4';
}
