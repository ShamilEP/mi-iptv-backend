import type {
  AcceptBatchedSyncEvents,
  BatchedSyncEventInput,
} from '../../../application/sync/accept-batched-sync-events.js';
import type {
  HttpRequest,
  HttpResponse,
} from '../../../application/ports/http-server.js';
import {
  SYNC_BATCH_MAX_EVENTS,
  isBatchedSyncEntity,
} from '../../../domain/sync/sync-batch.js';
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

export async function handleAcceptBatchedSyncEvents(
  request: HttpRequest,
  acceptBatchedSyncEvents: AcceptBatchedSyncEvents,
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

  if (!Array.isArray(body.events)) {
    return {
      statusCode: 400,
      headers: SYNC_JSON_HEADERS,
      body: {
        error: 'events must be a non-empty array',
        code: 'SYNC_BATCH_INVALID',
      },
    };
  }

  if (body.events.length > SYNC_BATCH_MAX_EVENTS) {
    return {
      statusCode: 400,
      headers: SYNC_JSON_HEADERS,
      body: {
        error: `events must contain at most ${SYNC_BATCH_MAX_EVENTS} items`,
        code: 'SYNC_BATCH_TOO_LARGE',
      },
    };
  }

  const parsed: BatchedSyncEventInput[] = [];
  for (let index = 0; index < body.events.length; index += 1) {
    const event = parseBatchedEvent(body.events[index], index);
    if ('error' in event) {
      return event.error;
    }
    parsed.push(event.value);
  }

  try {
    const result = await acceptBatchedSyncEvents.execute({
      accountId,
      profileId,
      deviceId,
      events: parsed,
    });

    return {
      statusCode: 200,
      headers: SYNC_JSON_HEADERS,
      body: {
        status: result.status,
        results: result.results.map((item) => ({
          entity: item.entity,
          clientEventId: item.clientEventId,
          accepted: item.accepted,
          currentVersion: item.currentVersion,
          serverTimestamp: item.serverTimestamp.toISOString(),
          resolvedBy: item.resolvedBy,
          changeSeq: item.changeSeq,
          conflict: item.conflict,
        })),
      },
    };
  } catch (error: unknown) {
    return mapSyncDomainError(error);
  }
}

function parseBatchedEvent(
  raw: unknown,
  index: number,
): { value: BatchedSyncEventInput } | { error: HttpResponse } {
  const body = asObject(raw);
  if (!body) {
    return {
      error: {
        statusCode: 400,
        headers: SYNC_JSON_HEADERS,
        body: {
          error: `events[${index}] must be an object`,
          code: 'SYNC_BATCH_INVALID',
        },
      },
    };
  }

  const entityRaw = requiredString(body.entity);
  if (entityRaw === null || !isBatchedSyncEntity(entityRaw)) {
    return {
      error: {
        statusCode: 400,
        headers: SYNC_JSON_HEADERS,
        body: {
          error: `events[${index}].entity must be playback_state or favorite`,
          code: 'SYNC_BATCH_ENTITY_INVALID',
        },
      },
    };
  }

  if (entityRaw === 'playback_state') {
    return parsePlaybackBatchEvent(body, index);
  }

  return parseFavoriteBatchEvent(body, index);
}

function parsePlaybackBatchEvent(
  body: Record<string, unknown>,
  index: number,
): { value: BatchedSyncEventInput } | { error: HttpResponse } {
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
      error: {
        statusCode: 400,
        headers: SYNC_JSON_HEADERS,
        body: {
          error: `events[${index}] playback_state requires clientEventId, contentId, position, completed, syncVersion`,
          code: 'SYNC_PAYLOAD_INVALID',
        },
      },
    };
  }

  const duration = optionalNumber(body.duration);
  const sourceId = optionalString(body.sourceId);
  const forceReset = optionalBoolean(body.forceReset);
  const clientReportedAt = optionalDate(body.clientReportedAt);

  return {
    value: {
      entity: 'playback_state',
      clientEventId,
      contentId,
      position,
      completed,
      syncVersion,
      ...(duration !== undefined ? { duration } : {}),
      ...(sourceId !== undefined ? { sourceId } : {}),
      ...(forceReset !== undefined ? { forceReset } : {}),
      ...(clientReportedAt !== undefined ? { clientReportedAt } : {}),
    },
  };
}

function parseFavoriteBatchEvent(
  body: Record<string, unknown>,
  index: number,
): { value: BatchedSyncEventInput } | { error: HttpResponse } {
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
      error: {
        statusCode: 400,
        headers: SYNC_JSON_HEADERS,
        body: {
          error: `events[${index}] favorite requires clientEventId, itemId, action, syncVersion`,
          code: 'SYNC_PAYLOAD_INVALID',
        },
      },
    };
  }

  const type = optionalString(body.type);
  const sortOrder = optionalNumber(body.sortOrder);
  const clientReportedAt = optionalDate(body.clientReportedAt);

  return {
    value: {
      entity: 'favorite',
      clientEventId,
      itemId,
      action,
      syncVersion,
      ...(type !== undefined ? { type } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
      ...(clientReportedAt !== undefined ? { clientReportedAt } : {}),
    },
  };
}
