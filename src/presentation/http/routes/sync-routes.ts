import type { UpsertPlaybackState } from '../../../application/sync/upsert-playback-state.js';
import type {
  HttpRequest,
  HttpResponse,
  HttpRoute,
} from '../../../application/ports/http-server.js';
import { DomainError } from '../../../domain/shared/domain-error.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
} as const;

export function createSyncRoutes(deps: {
  readonly upsertPlaybackState: UpsertPlaybackState;
}): readonly HttpRoute[] {
  return [
    {
      method: 'POST',
      path: '/api/v1/sync/playback-state',
      handler: (request) =>
        handleUpsertPlaybackState(request, deps.upsertPlaybackState),
    },
  ];
}

async function handleUpsertPlaybackState(
  request: HttpRequest,
  upsertPlaybackState: UpsertPlaybackState,
): Promise<HttpResponse> {
  const accountId = requireHeader(request, 'x-account-id', 'account');
  if (typeof accountId !== 'string') {
    return accountId;
  }
  const profileId = requireHeader(request, 'x-profile-id', 'profile');
  if (typeof profileId !== 'string') {
    return profileId;
  }
  const deviceId = requireHeader(request, 'x-device-id', 'device');
  if (typeof deviceId !== 'string') {
    return deviceId;
  }

  const body = asObject(request.body);
  if (!body) {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: { error: 'JSON object body required' },
    };
  }

  const clientEventId = requiredString(body.clientEventId);
  const contentId = requiredString(body.contentId);
  const position = requiredNumber(body.position);
  const completed = requiredBoolean(body.completed);
  const syncVersion = requiredNumber(body.syncVersion);
  if (
    clientEventId === null ||
    contentId === null ||
    position === null ||
    completed === null ||
    syncVersion === null
  ) {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: {
        error:
          'clientEventId, contentId, position, completed, and syncVersion are required',
        code: 'SYNC_PAYLOAD_INVALID',
      },
    };
  }

  try {
    const duration = optionalNumber(body.duration);
    const sourceId = optionalString(body.sourceId);
    const forceReset = optionalBoolean(body.forceReset);
    const clientReportedAt = optionalDate(body.clientReportedAt);

    const result = await upsertPlaybackState.execute({
      accountId,
      profileId,
      deviceId,
      clientEventId,
      contentId,
      position,
      completed,
      syncVersion,
      ...(duration !== undefined ? { duration } : {}),
      ...(sourceId !== undefined ? { sourceId } : {}),
      ...(forceReset !== undefined ? { forceReset } : {}),
      ...(clientReportedAt !== undefined ? { clientReportedAt } : {}),
    });

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: {
        status: result.status,
        accepted: result.accepted,
        currentVersion: result.currentVersion,
        serverTimestamp: result.serverTimestamp.toISOString(),
        resolvedBy: result.resolvedBy,
        changeSeq: result.changeSeq,
      },
    };
  } catch (error: unknown) {
    return mapDomainError(error);
  }
}

function requireHeader(
  request: HttpRequest,
  name: string,
  label: string,
): string | HttpResponse {
  if (
    name === 'x-account-id' &&
    typeof request.accountId === 'string' &&
    request.accountId.trim().length > 0
  ) {
    return request.accountId.trim();
  }

  const raw = request.headers[name] ?? request.headers[name.toLowerCase()];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || value.trim().length === 0) {
    if (name === 'x-account-id') {
      return {
        statusCode: 401,
        headers: JSON_HEADERS,
        body: { error: 'Missing x-account-id (Sprint 0 stand-in for JWT)' },
      };
    }
    return {
      statusCode: 401,
      headers: JSON_HEADERS,
      body: {
        error: `Missing ${name} (Sprint 0 stand-in for ${label} context)`,
      },
    };
  }
  return value.trim();
}

function mapDomainError(error: unknown): HttpResponse {
  if (error instanceof DomainError) {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: { error: error.message, code: error.code },
    };
  }
  throw error;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function requiredNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function requiredBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function optionalDate(value: unknown): Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return undefined;
}
