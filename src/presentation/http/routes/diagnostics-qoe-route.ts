import type { IngestQoeEvents } from '../../../application/diagnostics/ingest-qoe-events.js';
import type {
  HttpRequest,
  HttpResponse,
} from '../../../application/ports/http-server.js';
import { DomainError } from '../../../domain/shared/domain-error.js';
import { QOE_BATCH_MAX_EVENTS } from '../../../domain/telemetry/qoe-batch.js';
import {
  asObject,
  optionalBoolean,
  optionalNumber,
  optionalString,
  requiredString,
} from './sync-route-helpers.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
} as const;

const REQUEST_KEYS = new Set([
  'anonymousSessionId',
  'telemetryOptIn',
  'appVersion',
  'deviceModel',
  'events',
]);

const EVENT_KEYS = new Set([
  'sourceProvider',
  'timeToFirstFrameMs',
  'rebufferEventsCount',
  'rebufferDurationMs',
  'streamErrorsCount',
]);

/**
 * POST /api/v1/diagnostics/qoe (BE-090).
 * Auth via gateway JWT; account id is never forwarded to persistence.
 */
export async function handleIngestQoeEvents(
  request: HttpRequest,
  ingestQoeEvents: IngestQoeEvents,
): Promise<HttpResponse> {
  if (
    request.accountId === undefined ||
    request.accountId === null ||
    request.accountId.trim() === ''
  ) {
    return {
      statusCode: 401,
      headers: JSON_HEADERS,
      body: {
        error: 'Bearer access token required',
        code: 'AUTH_ACCESS_INVALID',
      },
    };
  }

  const body = asObject(request.body);
  if (!body) {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: { error: 'JSON object body required', code: 'QOE_BODY_INVALID' },
    };
  }

  for (const key of Object.keys(body)) {
    if (!REQUEST_KEYS.has(key)) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: {
          error: `Unknown field: ${key}`,
          code: 'QOE_BODY_INVALID',
        },
      };
    }
  }

  const anonymousSessionId = requiredString(body.anonymousSessionId);
  if (anonymousSessionId === null) {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: {
        error: 'anonymousSessionId is required',
        code: 'QOE_SESSION_INVALID',
      },
    };
  }

  if (!Array.isArray(body.events)) {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: {
        error: 'events must be a non-empty array',
        code: 'QOE_BATCH_INVALID',
      },
    };
  }

  if (body.events.length > QOE_BATCH_MAX_EVENTS) {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: {
        error: `events must contain at most ${QOE_BATCH_MAX_EVENTS} items`,
        code: 'QOE_BATCH_TOO_LARGE',
      },
    };
  }

  const events = [];
  for (let index = 0; index < body.events.length; index += 1) {
    const parsed = parseQoeEvent(body.events[index], index);
    if ('error' in parsed) {
      return parsed.error;
    }
    events.push(parsed.value);
  }

  try {
    const telemetryOptIn = optionalBoolean(body.telemetryOptIn);
    const appVersion = optionalString(body.appVersion);
    const deviceModel = optionalString(body.deviceModel);
    const result = await ingestQoeEvents.execute({
      anonymousSessionId,
      events,
      ...(telemetryOptIn !== undefined ? { telemetryOptIn } : {}),
      ...(appVersion !== undefined ? { appVersion } : {}),
      ...(deviceModel !== undefined ? { deviceModel } : {}),
    });

    return {
      statusCode: 202,
      headers: JSON_HEADERS,
      body: {
        accepted: result.accepted,
        ...(result.skippedOptOut === true ? { skippedOptOut: true } : {}),
      },
    };
  } catch (error: unknown) {
    return mapQoeDomainError(error);
  }
}

function parseQoeEvent(
  raw: unknown,
  index: number,
):
  | {
      value: {
        sourceProvider: string;
        timeToFirstFrameMs?: number;
        rebufferEventsCount?: number;
        rebufferDurationMs?: number;
        streamErrorsCount?: number;
      };
    }
  | { error: HttpResponse } {
  const body = asObject(raw);
  if (!body) {
    return {
      error: {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: {
          error: `events[${index}] must be an object`,
          code: 'QOE_EVENT_INVALID',
        },
      },
    };
  }

  for (const key of Object.keys(body)) {
    if (!EVENT_KEYS.has(key)) {
      return {
        error: {
          statusCode: 400,
          headers: JSON_HEADERS,
          body: {
            error: `events[${index}] unknown field: ${key}`,
            code: 'QOE_EVENT_INVALID',
          },
        },
      };
    }
  }

  const sourceProvider = requiredString(body.sourceProvider);
  if (sourceProvider === null) {
    return {
      error: {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: {
          error: `events[${index}].sourceProvider is required`,
          code: 'QOE_PROVIDER_INVALID',
        },
      },
    };
  }

  const timeToFirstFrameMs = optionalNumber(body.timeToFirstFrameMs);
  const rebufferEventsCount = optionalNumber(body.rebufferEventsCount);
  const rebufferDurationMs = optionalNumber(body.rebufferDurationMs);
  const streamErrorsCount = optionalNumber(body.streamErrorsCount);

  return {
    value: {
      sourceProvider,
      ...(timeToFirstFrameMs !== undefined ? { timeToFirstFrameMs } : {}),
      ...(rebufferEventsCount !== undefined ? { rebufferEventsCount } : {}),
      ...(rebufferDurationMs !== undefined ? { rebufferDurationMs } : {}),
      ...(streamErrorsCount !== undefined ? { streamErrorsCount } : {}),
    },
  };
}

function mapQoeDomainError(error: unknown): HttpResponse {
  if (error instanceof DomainError) {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: { error: error.message, code: error.code },
    };
  }
  throw error;
}
