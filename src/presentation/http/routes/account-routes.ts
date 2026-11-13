import type { DeleteAccount } from '../../../application/account/delete-account.js';
import type { ExportAccountData } from '../../../application/account/export-account-data.js';
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

export function createAccountRoutes(deps: {
  readonly exportAccountData: ExportAccountData;
  readonly deleteAccount: DeleteAccount;
}): readonly HttpRoute[] {
  return [
    {
      method: 'GET',
      path: '/api/v1/account/export',
      handler: (request) => handleExport(request, deps.exportAccountData),
    },
    {
      method: 'DELETE',
      path: '/api/v1/account',
      handler: (request) => handleDelete(request, deps.deleteAccount),
    },
  ];
}

async function handleExport(
  request: HttpRequest,
  exportAccountData: ExportAccountData,
): Promise<HttpResponse> {
  const accessToken = readBearerToken(request) ?? readBodyAccessToken(request);
  if (accessToken === null) {
    return {
      statusCode: 401,
      headers: JSON_HEADERS,
      body: {
        error: 'Bearer access token required',
        code: 'AUTH_ACCESS_INVALID',
      },
    };
  }

  try {
    const body = await exportAccountData.execute({ accessToken });
    return { statusCode: 200, headers: JSON_HEADERS, body };
  } catch (error: unknown) {
    return mapDomainError(error);
  }
}

async function handleDelete(
  request: HttpRequest,
  deleteAccount: DeleteAccount,
): Promise<HttpResponse> {
  const accessToken = readBearerToken(request) ?? readBodyAccessToken(request);
  if (accessToken === null) {
    return {
      statusCode: 401,
      headers: JSON_HEADERS,
      body: {
        error: 'Bearer access token required',
        code: 'AUTH_ACCESS_INVALID',
      },
    };
  }

  try {
    const result = await deleteAccount.execute({ accessToken });
    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: { status: result.status },
    };
  } catch (error: unknown) {
    return mapDomainError(error);
  }
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

function readBodyAccessToken(request: HttpRequest): string | null {
  const body = request.body;
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  const token = (body as Record<string, unknown>).accessToken;
  return typeof token === 'string' && token.trim() !== ''
    ? token.trim()
    : null;
}

function mapDomainError(error: unknown): HttpResponse {
  if (error instanceof DomainError) {
    const statusCode =
      error.code === 'AUTH_ACCOUNT_NOT_FOUND'
        ? 404
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
