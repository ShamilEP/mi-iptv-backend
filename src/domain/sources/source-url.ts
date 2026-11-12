import { SsrfGuardError } from './ssrf-guard-error.js';
import { isBlockedMetadataHostname } from './blocked-network-address.js';

const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

export type ParsedSourceUrl = {
  readonly href: string;
  readonly protocol: 'http:' | 'https:';
  readonly hostname: string;
  readonly port: string;
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
};

/**
 * Parse and validate a user-supplied IPTV source URL.
 * Allows only http/https; rejects metadata hostnames at parse time.
 */
export function parseSourceUrl(raw: string): ParsedSourceUrl {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new SsrfGuardError('Source URL is required', 'SOURCE_URL_INVALID');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new SsrfGuardError('Source URL is invalid', 'SOURCE_URL_INVALID');
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw new SsrfGuardError(
      'Source URL scheme must be http or https',
      'SOURCE_URL_SCHEME_FORBIDDEN',
    );
  }

  if (!parsed.hostname) {
    throw new SsrfGuardError(
      'Source URL must include a hostname',
      'SOURCE_URL_INVALID',
    );
  }

  const hostname = stripIpv6Brackets(parsed.hostname.toLowerCase());
  if (isBlockedMetadataHostname(hostname)) {
    throw new SsrfGuardError(
      'Source URL host is not allowed',
      'SOURCE_URL_HOST_BLOCKED',
    );
  }

  return {
    href: parsed.href,
    protocol: parsed.protocol as 'http:' | 'https:',
    hostname,
    port: parsed.port,
    pathname: parsed.pathname,
    search: parsed.search,
    hash: parsed.hash,
  };
}

export function resolveSourceRedirectUrl(
  currentHref: string,
  locationHeader: string,
): ParsedSourceUrl {
  const location = locationHeader.trim();
  if (location.length === 0) {
    throw new SsrfGuardError(
      'Redirect location is missing',
      'SOURCE_URL_INVALID',
    );
  }
  try {
    return parseSourceUrl(new URL(location, currentHref).href);
  } catch (error: unknown) {
    if (error instanceof SsrfGuardError) {
      throw error;
    }
    throw new SsrfGuardError(
      'Redirect location is invalid',
      'SOURCE_URL_INVALID',
    );
  }
}

function stripIpv6Brackets(hostname: string): string {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return hostname.slice(1, -1);
  }
  return hostname;
}
