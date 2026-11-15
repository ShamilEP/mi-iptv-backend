import type { ClearWatchHistory } from '../../../application/history/clear-watch-history.js';
import type { ListWatchHistory } from '../../../application/history/list-watch-history.js';
import type { RecordWatchHistory } from '../../../application/history/record-watch-history.js';
import type {
  GetWatchHistoryPrivacy,
  UpdateWatchHistoryPrivacy,
} from '../../../application/history/update-watch-history-privacy.js';
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

export function createProfilesHistoryRoutes(deps: {
  readonly listWatchHistory: ListWatchHistory;
  readonly recordWatchHistory: RecordWatchHistory;
  readonly clearWatchHistory: ClearWatchHistory;
  readonly getWatchHistoryPrivacy: GetWatchHistoryPrivacy;
  readonly updateWatchHistoryPrivacy: UpdateWatchHistoryPrivacy;
}): readonly HttpRoute[] {
  return [
    {
      method: 'GET',
      path: '/api/v1/profiles/{id}/history',
      handler: (request) => handleList(request, deps.listWatchHistory),
    },
    {
      method: 'POST',
      path: '/api/v1/profiles/{id}/history',
      handler: (request) => handleRecord(request, deps.recordWatchHistory),
    },
    {
      method: 'DELETE',
      path: '/api/v1/profiles/{id}/history',
      handler: (request) => handleClear(request, deps.clearWatchHistory),
    },
    {
      method: 'GET',
      path: '/api/v1/profiles/{id}/privacy',
      handler: (request) => handleGetPrivacy(request, deps.getWatchHistoryPrivacy),
    },
    {
      method: 'PATCH',
      path: '/api/v1/profiles/{id}/privacy',
      handler: (request) =>
        handlePatchPrivacy(request, deps.updateWatchHistoryPrivacy),
    },
  ];
}

async function handleList(
  request: HttpRequest,
  listWatchHistory: ListWatchHistory,
): Promise<HttpResponse> {
  const accessToken = readBearerToken(request);
  if (accessToken === null) {
    return unauthorized();
  }
  const profileId = readPathId(request);
  if (profileId === null) {
    return badRequest('profile id required');
  }
  try {
    const body = await listWatchHistory.execute({ accessToken, profileId });
    return { statusCode: 200, headers: JSON_HEADERS, body };
  } catch (error: unknown) {
    return mapDomainError(error);
  }
}

async function handleRecord(
  request: HttpRequest,
  recordWatchHistory: RecordWatchHistory,
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
  if (!body || typeof body.contentId !== 'string') {
    return badRequest('JSON body with contentId is required');
  }

  if (
    Object.prototype.hasOwnProperty.call(body, 'sourceId') &&
    body.sourceId !== null &&
    typeof body.sourceId !== 'string'
  ) {
    return badRequest('sourceId must be a string or null');
  }

  try {
    const result = await recordWatchHistory.execute({
      accessToken,
      profileId,
      contentId: body.contentId,
      ...(Object.prototype.hasOwnProperty.call(body, 'sourceId')
        ? {
            sourceId:
              body.sourceId === null ? null : (body.sourceId as string),
          }
        : {}),
      ...(typeof body.positionSec === 'number'
        ? { positionSec: body.positionSec }
        : {}),
      ...(typeof body.durationSec === 'number'
        ? { durationSec: body.durationSec }
        : {}),
      ...(typeof body.completed === 'boolean'
        ? { completed: body.completed }
        : {}),
      ...(typeof body.watchedAt === 'string'
        ? { watchedAt: new Date(body.watchedAt) }
        : {}),
    });
    return { statusCode: 201, headers: JSON_HEADERS, body: result };
  } catch (error: unknown) {
    return mapDomainError(error);
  }
}

async function handleClear(
  request: HttpRequest,
  clearWatchHistory: ClearWatchHistory,
): Promise<HttpResponse> {
  const accessToken = readBearerToken(request);
  if (accessToken === null) {
    return unauthorized();
  }
  const profileId = readPathId(request);
  if (profileId === null) {
    return badRequest('profile id required');
  }
  try {
    const body = await clearWatchHistory.execute({ accessToken, profileId });
    return { statusCode: 200, headers: JSON_HEADERS, body };
  } catch (error: unknown) {
    return mapDomainError(error);
  }
}

async function handleGetPrivacy(
  request: HttpRequest,
  getWatchHistoryPrivacy: GetWatchHistoryPrivacy,
): Promise<HttpResponse> {
  const accessToken = readBearerToken(request);
  if (accessToken === null) {
    return unauthorized();
  }
  const profileId = readPathId(request);
  if (profileId === null) {
    return badRequest('profile id required');
  }
  try {
    const body = await getWatchHistoryPrivacy.execute({
      accessToken,
      profileId,
    });
    return { statusCode: 200, headers: JSON_HEADERS, body };
  } catch (error: unknown) {
    return mapDomainError(error);
  }
}

async function handlePatchPrivacy(
  request: HttpRequest,
  updateWatchHistoryPrivacy: UpdateWatchHistoryPrivacy,
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
  if (!body || typeof body.historyEnabled !== 'boolean') {
    return badRequest('JSON body with historyEnabled boolean is required');
  }
  try {
    const result = await updateWatchHistoryPrivacy.execute({
      accessToken,
      profileId,
      historyEnabled: body.historyEnabled,
    });
    return { statusCode: 200, headers: JSON_HEADERS, body: result };
  } catch (error: unknown) {
    return mapDomainError(error);
  }
}

function readBearerToken(request: HttpRequest): string | null {
  const header = request.headers.authorization ?? request.headers.Authorization;
  if (typeof header !== 'string') {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() ? match[1].trim() : null;
}

function readPathId(request: HttpRequest): string | null {
  const raw = request.params?.id;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return null;
  }
  return raw.trim();
}

function asObject(body: unknown): Record<string, unknown> | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  return body as Record<string, unknown>;
}

function unauthorized(): HttpResponse {
  return {
    statusCode: 401,
    headers: JSON_HEADERS,
    body: { error: 'Unauthorized', code: 'AUTH_ACCESS_INVALID' },
  };
}

function badRequest(message: string): HttpResponse {
  return {
    statusCode: 400,
    headers: JSON_HEADERS,
    body: { error: message, code: 'HISTORY_INPUT_INVALID' },
  };
}

function mapDomainError(error: unknown): HttpResponse {
  if (!(error instanceof DomainError)) {
    throw error;
  }
  const statusCode = UNAUTHORIZED_CODES.has(error.code)
    ? 401
    : error.code === 'PROFILE_NOT_FOUND'
      ? 404
      : error.code === 'HISTORY_PRIVACY_DISABLED'
        ? 403
        : 400;
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: { error: error.message, code: error.code },
  };
}
