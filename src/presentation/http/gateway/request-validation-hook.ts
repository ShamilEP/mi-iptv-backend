import type {
  HttpRequest,
  HttpResponse,
} from '../../../application/ports/http-server.js';
import { buildErrorEnvelope } from '../../../domain/api/error-envelope.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
} as const;

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

/**
 * Gateway request-validation hook (BE-006): JSON Content-Type for bodies.
 * Route handlers still own field-level schema checks.
 */
export function runRequestValidationHook(
  request: HttpRequest,
  traceId: string,
): HttpResponse | null {
  const method = request.method.toUpperCase();
  if (!BODY_METHODS.has(method)) {
    return null;
  }

  if (request.body === undefined) {
    return null;
  }

  const contentType = readHeader(request, 'content-type');
  if (contentType === null) {
    return {
      statusCode: 415,
      headers: JSON_HEADERS,
      body: buildErrorEnvelope({
        error: 'Content-Type application/json required when a body is sent',
        code: 'REQUEST_CONTENT_TYPE_INVALID',
        traceId,
      }),
    };
  }

  const mediaType = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (mediaType !== 'application/json') {
    return {
      statusCode: 415,
      headers: JSON_HEADERS,
      body: buildErrorEnvelope({
        error: 'Content-Type must be application/json',
        code: 'REQUEST_CONTENT_TYPE_INVALID',
        traceId,
        details: { contentType: mediaType },
      }),
    };
  }

  return null;
}

function readHeader(request: HttpRequest, name: string): string | null {
  const raw = request.headers[name] ?? request.headers[name.toLowerCase()];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  return value.trim();
}
