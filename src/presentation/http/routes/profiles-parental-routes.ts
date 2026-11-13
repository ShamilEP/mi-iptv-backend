import { AuthRateLimitError } from '../../../application/auth/auth-rate-limit-error.js';
import type { SetParentalPin } from '../../../application/profiles/set-parental-pin.js';
import type { UpdateProfileRestrictions } from '../../../application/profiles/update-profile-restrictions.js';
import type { VerifyParentalPin } from '../../../application/profiles/verify-parental-pin.js';
import type {
  HttpRequest,
  HttpResponse,
  HttpRoute,
} from '../../../application/ports/http-server.js';
import { DomainError } from '../../../domain/shared/domain-error.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
} as const;

const UNAUTHORIZED_CODES = new Set([
  'AUTH_INVALID',
  'AUTH_ACCESS_INVALID',
  'AUTH_ACCESS_REVOKED',
]);

export function createProfilesParentalRoutes(deps: {
  readonly setParentalPin: SetParentalPin;
  readonly verifyParentalPin: VerifyParentalPin;
  readonly updateProfileRestrictions: UpdateProfileRestrictions;
}): readonly HttpRoute[] {
  return [
    {
      method: 'PUT',
      path: '/api/v1/profiles/{id}/pin',
      handler: (request) => handleSetPin(request, deps.setParentalPin),
    },
    {
      method: 'POST',
      path: '/api/v1/profiles/{id}/verify-pin',
      handler: (request) => handleVerifyPin(request, deps.verifyParentalPin),
    },
    {
      method: 'PATCH',
      path: '/api/v1/profiles/{id}/restrictions',
      handler: (request) =>
        handleRestrictions(request, deps.updateProfileRestrictions),
    },
  ];
}

async function handleSetPin(
  request: HttpRequest,
  setParentalPin: SetParentalPin,
): Promise<HttpResponse> {
  const accessToken = readBearerToken(request);
  if (accessToken === null) {
    return unauthorized();
  }
  const profileId = readPathId(request);
  if (profileId === null) {
    return badRequest('profile id required');
  }
  const body = asObject(request.body);
  if (!body || !Object.prototype.hasOwnProperty.call(body, 'pin')) {
    return badRequest('JSON body with pin is required');
  }

  const pin =
    body.pin === null
      ? null
      : typeof body.pin === 'string'
        ? body.pin
        : null;
  if (body.pin !== null && typeof body.pin !== 'string') {
    return badRequest('pin must be a string or null');
  }

  try {
    const result = await setParentalPin.execute({
      accessToken,
      profileId,
      pin,
      ...(typeof body.currentPin === 'string'
        ? { currentPin: body.currentPin }
        : {}),
    });
    return { statusCode: 200, headers: JSON_HEADERS, body: result };
  } catch (error: unknown) {
    return mapDomainError(error);
  }
}

async function handleVerifyPin(
  request: HttpRequest,
  verifyParentalPin: VerifyParentalPin,
): Promise<HttpResponse> {
  const accessToken = readBearerToken(request);
  if (accessToken === null) {
    return unauthorized();
  }
  const profileId = readPathId(request);
  if (profileId === null) {
    return badRequest('profile id required');
  }
  const body = asObject(request.body);
  if (!body || typeof body.pin !== 'string') {
    return badRequest('JSON body with pin string is required');
  }

  try {
    const result = await verifyParentalPin.execute({
      accessToken,
      profileId,
      pin: body.pin,
      ...(request.clientIp !== undefined && request.clientIp !== null
        ? { clientIp: request.clientIp }
        : {}),
    });
    return { statusCode: 200, headers: JSON_HEADERS, body: result };
  } catch (error: unknown) {
    return mapDomainError(error);
  }
}

async function handleRestrictions(
  request: HttpRequest,
  updateProfileRestrictions: UpdateProfileRestrictions,
): Promise<HttpResponse> {
  const accessToken = readBearerToken(request);
  if (accessToken === null) {
    return unauthorized();
  }
  const profileId = readPathId(request);
  if (profileId === null) {
    return badRequest('profile id required');
  }
  const body = asObject(request.body);
  if (!body) {
    return badRequest('JSON object body required');
  }

  try {
    const result = await updateProfileRestrictions.execute({
      accessToken,
      profileId,
      ...(body.kidMode !== undefined
        ? { kidMode: Boolean(body.kidMode) }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(body, 'maxRating')
        ? {
            maxRating:
              body.maxRating === null ? null : String(body.maxRating),
          }
        : {}),
      ...(Array.isArray(body.allowedSourceIds)
        ? {
            allowedSourceIds: body.allowedSourceIds.map((item) =>
              String(item),
            ),
          }
        : {}),
      ...(Array.isArray(body.blockedSourceIds)
        ? {
            blockedSourceIds: body.blockedSourceIds.map((item) =>
              String(item),
            ),
          }
        : {}),
    });
    return { statusCode: 200, headers: JSON_HEADERS, body: result };
  } catch (error: unknown) {
    return mapDomainError(error);
  }
}

function unauthorized(): HttpResponse {
  return {
    statusCode: 401,
    headers: JSON_HEADERS,
    body: {
      error: 'Bearer access token required',
      code: 'AUTH_ACCESS_INVALID',
    },
  };
}

function badRequest(message: string): HttpResponse {
  return {
    statusCode: 400,
    headers: JSON_HEADERS,
    body: { error: message, code: 'PROFILE_INPUT_INVALID' },
  };
}

function readPathId(request: HttpRequest): string | null {
  const profileId = request.params?.id;
  if (typeof profileId !== 'string' || profileId.trim() === '') {
    return null;
  }
  return profileId.trim();
}

function readBearerToken(request: HttpRequest): string | null {
  const raw =
    request.headers['authorization'] ?? request.headers['Authorization'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  if (!match || match[1] === undefined || match[1].trim() === '') {
    return null;
  }
  return match[1].trim();
}

function asObject(body: unknown): Record<string, unknown> | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  return body as Record<string, unknown>;
}

function mapDomainError(error: unknown): HttpResponse {
  if (error instanceof AuthRateLimitError) {
    const retryAfter = Math.max(1, Math.floor(error.retryAfterSeconds));
    return {
      statusCode: 429,
      headers: {
        ...JSON_HEADERS,
        'retry-after': String(retryAfter),
      },
      body: {
        error: error.message,
        code: 'PARENTAL_PIN_RATE_LIMITED',
        retryAfterSeconds: retryAfter,
      },
    };
  }
  if (error instanceof DomainError) {
    const statusCode =
      error.code === 'PROFILE_NOT_FOUND'
        ? 404
        : error.code === 'PARENTAL_PIN_NOT_SET'
          ? 404
          : error.code === 'PARENTAL_PIN_INVALID' ||
              error.code === 'PARENTAL_PIN_CURRENT_REQUIRED'
            ? 401
            : UNAUTHORIZED_CODES.has(error.code)
              ? 401
              : 400;
    return {
      statusCode,
      headers: JSON_HEADERS,
      body: { error: error.message, code: error.code },
    };
  }
  return {
    statusCode: 500,
    headers: JSON_HEADERS,
    body: { error: 'Internal server error', code: 'INTERNAL' },
  };
}
