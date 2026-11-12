import { SsrfGuardError } from '../../domain/sources/ssrf-guard-error.js';
import { resolveSourceRedirectUrl } from '../../domain/sources/source-url.js';
import type { SourceHttpClient } from '../ports/source-http-client.js';
import type { SourceHttpGuardLimits } from './source-http-guard-limits.js';
import { ValidateSourceUrl } from './validate-source-url.js';

export type SafeSourceFetchResult = {
  readonly finalUrl: string;
  readonly statusCode: number;
  readonly body: Uint8Array;
  readonly redirectCount: number;
};

/**
 * Fetches a user-supplied source URL with SSRF controls:
 * scheme allowlist, DNS + address re-check each hop, redirect/size caps.
 */
export class FetchSourceUrlSafely {
  constructor(
    private readonly validateSourceUrl: ValidateSourceUrl,
    private readonly http: SourceHttpClient,
    private readonly config: SourceHttpGuardLimits,
  ) {}

  async execute(rawUrl: string): Promise<SafeSourceFetchResult> {
    let currentUrl = rawUrl;
    let redirectCount = 0;

    for (;;) {
      const target = await this.validateSourceUrl.execute(currentUrl);
      const response = await this.http.request({
        url: target.url.href,
        hostname: target.url.hostname,
        resolvedAddress: target.connectAddress,
        method: 'GET',
        timeoutMs: this.config.timeoutMs,
        maxResponseBytes: this.config.maxResponseBytes,
      });

      if (isRedirect(response.statusCode)) {
        const location = response.headers['location'];
        if (location === undefined) {
          throw new SsrfGuardError(
            'Redirect response missing Location header',
            'SOURCE_HTTP_FAILED',
          );
        }
        if (redirectCount >= this.config.maxRedirects) {
          throw new SsrfGuardError(
            `Source URL exceeded redirect limit (${this.config.maxRedirects})`,
            'SOURCE_HTTP_REDIRECT_LIMIT',
          );
        }
        const next = resolveSourceRedirectUrl(target.url.href, location);
        currentUrl = next.href;
        redirectCount += 1;
        continue;
      }

      return {
        finalUrl: target.url.href,
        statusCode: response.statusCode,
        body: response.body,
        redirectCount,
      };
    }
  }
}

function isRedirect(statusCode: number): boolean {
  return (
    statusCode === 301 ||
    statusCode === 302 ||
    statusCode === 303 ||
    statusCode === 307 ||
    statusCode === 308
  );
}
