import { ApiRateLimitError } from '../../../application/gateway/api-rate-limit-error.js';
import type { ApiRateLimitGuard } from '../../../application/gateway/api-rate-limit-guard.js';
import type {
  HttpRequest,
  HttpResponse,
} from '../../../application/ports/http-server.js';
import type { AccessTokenClaims } from '../../../domain/auth/access-token-claims.js';
import { buildErrorEnvelope } from '../../../domain/api/error-envelope.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
} as const;

/**
 * Global API rate-limit hook (BE-006): per access-token jti, else per client IP.
 */
export async function runRateLimitHook(
  request: HttpRequest,
  guard: ApiRateLimitGuard,
  claims: AccessTokenClaims | null,
  traceId: string,
): Promise<HttpResponse | null> {
  try {
    if (claims !== null) {
      await guard.assertAllowed({ kind: 'token', jti: claims.jti });
    } else {
      await guard.assertAllowed({
        kind: 'ip',
        clientIp: request.clientIp ?? 'unknown',
      });
    }
    return null;
  } catch (error: unknown) {
    if (error instanceof ApiRateLimitError) {
      const retryAfter = Math.max(1, Math.floor(error.retryAfterSeconds));
      return {
        statusCode: 429,
        headers: {
          ...JSON_HEADERS,
          'retry-after': String(retryAfter),
        },
        body: buildErrorEnvelope({
          error: error.message,
          code: error.code,
          traceId,
          details: { retryAfter },
        }),
      };
    }
    throw error;
  }
}
