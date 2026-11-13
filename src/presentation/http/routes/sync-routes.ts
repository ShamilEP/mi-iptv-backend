import type { AcceptBatchedSyncEvents } from '../../../application/sync/accept-batched-sync-events.js';
import type { ListFavorites } from '../../../application/sync/list-favorites.js';
import type { SetFavorite } from '../../../application/sync/set-favorite.js';
import type { UpsertPlaybackState } from '../../../application/sync/upsert-playback-state.js';
import type {
  HttpRequest,
  HttpResponse,
  HttpRoute,
} from '../../../application/ports/http-server.js';
import { handleAcceptBatchedSyncEvents } from './sync-events-route.js';
import {
  SYNC_JSON_HEADERS,
  asObject,
  mapSyncDomainError,
  optionalBoolean,
  optionalDate,
  optionalNumber,
  optionalString,
  requireSyncHeader,
  requiredBoolean,
  requiredNumber,
  requiredString,
} from './sync-route-helpers.js';

export function createSyncRoutes(deps: {
  readonly upsertPlaybackState: UpsertPlaybackState;
  readonly listFavorites: ListFavorites;
  readonly setFavorite: SetFavorite;
  readonly acceptBatchedSyncEvents: AcceptBatchedSyncEvents;
}): readonly HttpRoute[] {
  return [
    {
      method: 'POST',
      path: '/api/v1/sync/playback-state',
      handler: (request) =>
        handleUpsertPlaybackState(request, deps.upsertPlaybackState),
    },
    {
      method: 'GET',
      path: '/api/v1/sync/favorites',
      handler: (request) => handleListFavorites(request, deps.listFavorites),
    },
    {
      method: 'POST',
      path: '/api/v1/sync/favorites',
      handler: (request) => handleSetFavorite(request, deps.setFavorite),
    },
    {
      method: 'POST',
      path: '/api/v1/sync/events',
      handler: (request) =>
        handleAcceptBatchedSyncEvents(request, deps.acceptBatchedSyncEvents),
    },
  ];
}

async function handleUpsertPlaybackState(
  request: HttpRequest,
  upsertPlaybackState: UpsertPlaybackState,
): Promise<HttpResponse> {
  const accountId = requireSyncHeader(request, 'x-account-id', 'account');
  if (typeof accountId !== 'string') {
    return accountId;
  }
  const profileId = requireSyncHeader(request, 'x-profile-id', 'profile');
  if (typeof profileId !== 'string') {
    return profileId;
  }
  const deviceId = requireSyncHeader(request, 'x-device-id', 'device');
  if (typeof deviceId !== 'string') {
    return deviceId;
  }

  const body = asObject(request.body);
  if (!body) {
    return {
      statusCode: 400,
      headers: SYNC_JSON_HEADERS,
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
      headers: SYNC_JSON_HEADERS,
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
      headers: SYNC_JSON_HEADERS,
      body: {
        status: result.status,
        accepted: result.accepted,
        currentVersion: result.currentVersion,
        serverTimestamp: result.serverTimestamp.toISOString(),
        resolvedBy: result.resolvedBy,
        changeSeq: result.changeSeq,
        conflict: result.conflict,
      },
    };
  } catch (error: unknown) {
    return mapSyncDomainError(error);
  }
}

async function handleListFavorites(
  request: HttpRequest,
  listFavorites: ListFavorites,
): Promise<HttpResponse> {
  const accountId = requireSyncHeader(request, 'x-account-id', 'account');
  if (typeof accountId !== 'string') {
    return accountId;
  }
  const profileId = requireSyncHeader(request, 'x-profile-id', 'profile');
  if (typeof profileId !== 'string') {
    return profileId;
  }

  try {
    const items = await listFavorites.execute(accountId, profileId);
    return {
      statusCode: 200,
      headers: SYNC_JSON_HEADERS,
      body: { items },
    };
  } catch (error: unknown) {
    return mapSyncDomainError(error);
  }
}

async function handleSetFavorite(
  request: HttpRequest,
  setFavorite: SetFavorite,
): Promise<HttpResponse> {
  const accountId = requireSyncHeader(request, 'x-account-id', 'account');
  if (typeof accountId !== 'string') {
    return accountId;
  }
  const profileId = requireSyncHeader(request, 'x-profile-id', 'profile');
  if (typeof profileId !== 'string') {
    return profileId;
  }
  const deviceId = requireSyncHeader(request, 'x-device-id', 'device');
  if (typeof deviceId !== 'string') {
    return deviceId;
  }

  const body = asObject(request.body);
  if (!body) {
    return {
      statusCode: 400,
      headers: SYNC_JSON_HEADERS,
      body: { error: 'JSON object body required' },
    };
  }

  const clientEventId = requiredString(body.clientEventId);
  const itemId = requiredString(body.itemId);
  const action = requiredString(body.action);
  const syncVersion = requiredNumber(body.syncVersion);
  if (
    clientEventId === null ||
    itemId === null ||
    action === null ||
    syncVersion === null
  ) {
    return {
      statusCode: 400,
      headers: SYNC_JSON_HEADERS,
      body: {
        error: 'clientEventId, itemId, action, and syncVersion are required',
        code: 'SYNC_PAYLOAD_INVALID',
      },
    };
  }

  try {
    const type = optionalString(body.type);
    const sortOrder = optionalNumber(body.sortOrder);
    const clientReportedAt = optionalDate(body.clientReportedAt);

    const result = await setFavorite.execute({
      accountId,
      profileId,
      deviceId,
      clientEventId,
      itemId,
      action,
      syncVersion,
      ...(type !== undefined ? { type } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
      ...(clientReportedAt !== undefined ? { clientReportedAt } : {}),
    });

    return {
      statusCode: 200,
      headers: SYNC_JSON_HEADERS,
      body: {
        status: result.status,
        accepted: result.accepted,
        currentVersion: result.currentVersion,
        serverTimestamp: result.serverTimestamp.toISOString(),
        resolvedBy: result.resolvedBy,
        changeSeq: result.changeSeq,
        conflict: result.conflict,
      },
    };
  } catch (error: unknown) {
    return mapSyncDomainError(error);
  }
}
