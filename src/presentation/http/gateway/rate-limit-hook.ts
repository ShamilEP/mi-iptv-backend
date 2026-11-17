import { ApiRateLimitError } from '../../../application/gateway/api-rate-limit-error.js';
import type {
  ApiRateLimitDecision,
  ApiRateLimitGuard,
} from '../../../application/gateway/api-rate-limit-guard.js';
import { buildRateLimitHeaders } from '../../../application/gateway/rate-limit-headers.js';
import type {
  HttpRequest,
  HttpResponse,
} from '../../../application/ports/http-server.js';
import type { AccessTokenClaims } from '../../../domain/auth/access-token-claims.js';
import { buildErrorEnvelope } from '../../../domain/api/error-envelope.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
} as const;

export type RateLimitHookOk = {
  readonly ok: true;
  readonly decision: ApiRateLimitDecision;
  readonly headers: Readonly<Record<string, string>>;
};

export type RateLimitHookBlocked = {
  readonly ok: false;
  readonly response: HttpResponse;
};

/**
 * Global API rate-limit hook (BE-008): per access-token jti, else stricter per IP.
 */
export async function runRateLimitHook(
  request: HttpRequest,
  guard: ApiRateLimitGuard,
  claims: AccessTokenClaims | null,
  traceId: string,
): Promise<RateLimitHookOk | RateLimitHookBlocked> {
  try {
    const decision =
      claims !== null
        ? await guard.consume({ kind: 'token', jti: claims.jti })
        : await guard.consume({
            kind: 'ip',
            clientIp: request.clientIp ?? 'unknown',
          });
    return {
      ok: true,
      decision,
      headers: buildRateLimitHeaders(decision),
    };
  } catch (error: unknown) {
    if (error instanceof ApiRateLimitError) {
      const retryAfter = Math.max(1, Math.floor(error.retryAfterSeconds));
      return {
        ok: false,
        response: {
          statusCode: 429,
          headers: {
            ...JSON_HEADERS,
            ...buildRateLimitHeaders(
              {
                limit: error.meta.limit,
                remaining: error.meta.remaining,
                resetAtUnix: error.meta.resetAtUnix,
                retryAfterSeconds: retryAfter,
              },
              { includeRetryAfter: true },
            ),
          },
          body: buildErrorEnvelope({
            error: error.message,
            code: error.code,
            traceId,
            details: { retryAfter },
          }),
        },
      };
    }
    throw error;
  }
}
