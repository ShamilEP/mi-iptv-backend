import type {
  HttpRequest,
  HttpResponse,
} from '../../../application/ports/http-server.js';
import { DomainError } from '../../../domain/shared/domain-error.js';

export const SYNC_JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
} as const;

export function requireSyncHeader(
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
        headers: SYNC_JSON_HEADERS,
        body: { error: 'Missing x-account-id (Sprint 0 stand-in for JWT)' },
      };
    }
    return {
      statusCode: 401,
      headers: SYNC_JSON_HEADERS,
      body: {
        error: `Missing ${name} (Sprint 0 stand-in for ${label} context)`,
      },
    };
  }
  return value.trim();
}

export function mapSyncDomainError(error: unknown): HttpResponse {
  if (error instanceof DomainError) {
    const statusCode =
      error.code === 'PROFILE_NOT_FOUND'
        ? 404
        : error.code === 'AUTH_ACCESS_INVALID'
          ? 401
          : 400;
    return {
      statusCode,
      headers: SYNC_JSON_HEADERS,
      body: { error: error.message, code: error.code },
    };
  }
  throw error;
}

export function asObject(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function requiredString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

export function requiredNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function requiredBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

export function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function optionalDate(value: unknown): Date | null | undefined {
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
