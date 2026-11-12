import { M3uParseError } from '../../domain/catalog/m3u-parse-error.js';
import { XtreamError } from '../../domain/catalog/xtream-error.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import type { SourceTestReason } from '../../domain/sources/user-source.js';
import { SsrfGuardError } from '../../domain/sources/ssrf-guard-error.js';

export type ClassifiedSourceTestFailure = {
  readonly reason: Exclude<SourceTestReason, 'ok'>;
  readonly message: string;
};

/**
 * Maps adapter/SSRF/parser failures to UI-facing connectivity reasons (BE-043).
 */
export function classifySourceTestError(
  error: unknown,
): ClassifiedSourceTestFailure {
  if (error instanceof SsrfGuardError) {
    if (error.code === 'SOURCE_HTTP_TIMEOUT') {
      return { reason: 'timeout', message: 'Source request timed out' };
    }
    if (
      error.code === 'SOURCE_URL_DNS_FAILED' ||
      error.code === 'SOURCE_HTTP_FAILED' ||
      error.code === 'SOURCE_HTTP_REDIRECT_LIMIT' ||
      error.code === 'SOURCE_HTTP_RESPONSE_TOO_LARGE'
    ) {
      return { reason: 'unreachable', message: 'Source is unreachable' };
    }
    return { reason: 'unreachable', message: 'Source URL is not reachable' };
  }

  if (error instanceof M3uParseError) {
    if (error.code === 'M3U_TIMEOUT') {
      return { reason: 'timeout', message: 'Playlist parse timed out' };
    }
    return {
      reason: 'invalid_playlist',
      message: 'Playlist is invalid or could not be parsed',
    };
  }

  if (error instanceof XtreamError) {
    if (
      error.code === 'XTREAM_AUTH_FAILED' ||
      error.code === 'XTREAM_ACCOUNT_EXPIRED' ||
      error.code === 'XTREAM_ACCOUNT_BLOCKED'
    ) {
      return {
        reason: 'auth_failed',
        message: 'Source authentication failed',
      };
    }
    if (error.code === 'XTREAM_HTTP_FAILED') {
      return { reason: 'unreachable', message: 'Source is unreachable' };
    }
    return {
      reason: 'invalid_playlist',
      message: 'Source returned an invalid response',
    };
  }

  if (error instanceof DomainError) {
    if (error.code === 'SOURCE_INVALID_PLAYLIST') {
      return {
        reason: 'invalid_playlist',
        message: 'Playlist is invalid or empty',
      };
    }
    if (error.code === 'SOURCE_CREDENTIALS_REQUIRED') {
      return {
        reason: 'auth_failed',
        message: 'Source authentication failed',
      };
    }
    if (error.code === 'SOURCE_UNREACHABLE') {
      return { reason: 'unreachable', message: 'Source is unreachable' };
    }
  }

  if (error instanceof Error && /timed?\s*out/i.test(error.message)) {
    return { reason: 'timeout', message: 'Source request timed out' };
  }

  return { reason: 'unreachable', message: 'Source connectivity check failed' };
}
