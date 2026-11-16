import type { AssertAccessTokenActive } from '../../../application/auth/assert-access-token-active.js';
import type {
  HttpRequest,
  HttpResponse,
} from '../../../application/ports/http-server.js';
import type { AccessTokenClaims } from '../../../domain/auth/access-token-claims.js';
import { buildErrorEnvelope } from '../../../domain/api/error-envelope.js';
import { DomainError } from '../../../domain/shared/domain-error.js';
import { readBearerToken } from './read-bearer-token.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
} as const;

export type JwtAuthMiddlewareResult =
  | { readonly ok: true; readonly claims: AccessTokenClaims }
  | { readonly ok: false; readonly response: HttpResponse };

/**
 * JWT auth middleware: Bearer RS256 verify + deny-list (BE-006 / BE-023 / BE-025).
 */
export async function runJwtAuthMiddleware(
  request: HttpRequest,
  assertAccessTokenActive: AssertAccessTokenActive,
  traceId: string,
): Promise<JwtAuthMiddlewareResult> {
  const token = readBearerToken(request);
  if (token === null) {
    return {
      ok: false,
      response: {
        statusCode: 401,
        headers: JSON_HEADERS,
        body: buildErrorEnvelope({
          error: 'Bearer access token required',
          code: 'AUTH_ACCESS_INVALID',
          traceId,
        }),
      },
    };
  }

  try {
    const claims = await assertAccessTokenActive.execute(token);
    return { ok: true, claims };
  } catch (error: unknown) {
    if (error instanceof DomainError) {
      const statusCode =
        error.code === 'AUTH_ACCESS_REVOKED' ||
        error.code === 'AUTH_ACCESS_INVALID'
          ? 401
          : 400;
      return {
        ok: false,
        response: {
          statusCode,
          headers: JSON_HEADERS,
          body: buildErrorEnvelope({
            error: error.message,
            code: error.code,
            traceId,
          }),
        },
      };
    }
    return {
      ok: false,
      response: {
        statusCode: 401,
        headers: JSON_HEADERS,
        body: buildErrorEnvelope({
          error: 'Invalid access token',
          code: 'AUTH_ACCESS_INVALID',
          traceId,
        }),
      },
    };
  }
}
