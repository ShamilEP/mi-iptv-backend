import type { AssertAccessTokenActive } from '../../../application/auth/assert-access-token-active.js';
import type { ApiRateLimitGuard } from '../../../application/gateway/api-rate-limit-guard.js';
import type {
  HttpRequest,
  HttpResponse,
  HttpRoute,
  HttpRouteAuth,
} from '../../../application/ports/http-server.js';
import {
  isAllowedPublicApiPath,
  isUnversionedPublicPath,
} from '../../../domain/api/api-versioning.js';
import { buildErrorEnvelope } from '../../../domain/api/error-envelope.js';
import { runJwtAuthMiddleware } from './jwt-auth-middleware.js';
import { runRateLimitHook } from './rate-limit-hook.js';
import { runRequestValidationHook } from './request-validation-hook.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
} as const;

export type ApiGateway = {
  readonly maxJsonBodyBytes: number;
  beforeHandler(
    request: HttpRequest,
    route: HttpRoute,
    traceId: string,
  ): Promise<HttpResponse | { readonly request: HttpRequest }>;
};

export type CreateApiGatewayInput = {
  readonly assertAccessTokenActive: AssertAccessTokenActive;
  readonly apiRateLimitGuard: ApiRateLimitGuard;
  readonly maxJsonBodyBytes: number;
};

/**
 * API Gateway / BFF pipeline: versioning gate, validation, JWT, rate-limit (BE-006).
 */
export function createApiGateway(input: CreateApiGatewayInput): ApiGateway {
  return {
    maxJsonBodyBytes: input.maxJsonBodyBytes,
    async beforeHandler(request, route, traceId) {
      if (!isAllowedPublicApiPath(routePathWithoutParams(route.path))) {
        return {
          statusCode: 404,
          headers: JSON_HEADERS,
          body: buildErrorEnvelope({
            error: 'Not Found',
            code: 'NOT_FOUND',
            traceId,
          }),
        };
      }

      const validation = runRequestValidationHook(request, traceId);
      if (validation !== null) {
        return validation;
      }

      const authMode = resolveRouteAuth(route);
      let claims = request.auth ?? null;

      if (authMode === 'required') {
        const auth = await runJwtAuthMiddleware(
          request,
          input.assertAccessTokenActive,
          traceId,
        );
        if (!auth.ok) {
          return auth.response;
        }
        claims = auth.claims;
      }

      const skipRateLimit = isUnversionedPublicPath(request.url);
      if (!skipRateLimit) {
        const limited = await runRateLimitHook(
          request,
          input.apiRateLimitGuard,
          claims,
          traceId,
        );
        if (limited !== null) {
          return limited;
        }
      }

      if (claims === null) {
        return { request };
      }

      return {
        request: {
          ...request,
          auth: claims,
          accountId: claims.accountId,
        },
      };
    },
  };
}

export function resolveRouteAuth(route: HttpRoute): HttpRouteAuth {
  if (route.auth !== undefined) {
    return route.auth;
  }
  if (route.path === '/health' || route.path === '/realtime') {
    return 'public';
  }
  return 'required';
}

function routePathWithoutParams(path: string): string {
  // Templates like `/api/v1/sources/{id}` still match `/api/v1` prefix rules.
  return path;
}
