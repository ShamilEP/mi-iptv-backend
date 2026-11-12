import { DomainError } from '../../../domain/shared/domain-error.js';
import type { CreateSource } from '../../../application/sources/create-source.js';
import type { DeleteSource } from '../../../application/sources/delete-source.js';
import type { ListSources } from '../../../application/sources/list-sources.js';
import type { TestSource } from '../../../application/sources/test-source.js';
import type { UpdateSource } from '../../../application/sources/update-source.js';
import type {
  HttpRequest,
  HttpResponse,
  HttpRoute,
} from '../../../application/ports/http-server.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
} as const;

export function createSourcesRoutes(deps: {
  readonly listSources: ListSources;
  readonly createSource: CreateSource;
  readonly updateSource: UpdateSource;
  readonly deleteSource: DeleteSource;
  readonly testSource: TestSource;
}): readonly HttpRoute[] {
  return [
    {
      method: 'GET',
      path: '/api/v1/sources',
      handler: (request) => handleList(request, deps.listSources),
    },
    {
      method: 'POST',
      path: '/api/v1/sources',
      handler: (request) => handleCreate(request, deps.createSource),
    },
    {
      method: 'PATCH',
      path: '/api/v1/sources/{id}',
      handler: (request) => handleUpdate(request, deps.updateSource),
    },
    {
      method: 'DELETE',
      path: '/api/v1/sources/{id}',
      handler: (request) => handleDelete(request, deps.deleteSource),
    },
    {
      method: 'POST',
      path: '/api/v1/sources/{id}/test',
      handler: (request) => handleTest(request, deps.testSource),
    },
  ];
}

async function handleList(
  request: HttpRequest,
  listSources: ListSources,
): Promise<HttpResponse> {
  const accountId = requireAccountId(request);
  if (typeof accountId !== 'string') {
    return accountId;
  }
  const items = await listSources.execute(accountId);
  return { statusCode: 200, headers: JSON_HEADERS, body: { items } };
}

async function handleCreate(
  request: HttpRequest,
  createSource: CreateSource,
): Promise<HttpResponse> {
  const accountId = requireAccountId(request);
  if (typeof accountId !== 'string') {
    return accountId;
  }
  const body = asObject(request.body);
  if (!body) {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: { error: 'JSON object body required' },
    };
  }
  try {
    const priority = optionalNumber(body.priority);
    const credentials = optionalCredentials(body.credentials);
    const source = await createSource.execute({
      accountId,
      kind: String(body.kind ?? ''),
      name: String(body.name ?? ''),
      uriRef: String(body.uriRef ?? ''),
      ...(priority !== undefined ? { priority } : {}),
      ...(credentials !== undefined ? { credentials } : {}),
    });
    return { statusCode: 201, headers: JSON_HEADERS, body: source };
  } catch (error: unknown) {
    return mapDomainError(error);
  }
}

async function handleUpdate(
  request: HttpRequest,
  updateSource: UpdateSource,
): Promise<HttpResponse> {
  const accountId = requireAccountId(request);
  if (typeof accountId !== 'string') {
    return accountId;
  }
  const sourceId = request.params?.id;
  if (!sourceId) {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: { error: 'Source id required' },
    };
  }
  const body = asObject(request.body);
  if (!body) {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: { error: 'JSON object body required' },
    };
  }
  try {
    const name = optionalString(body.name);
    const uriRef = optionalString(body.uriRef);
    const priority = optionalNumber(body.priority);
    const enabled = optionalBoolean(body.enabled);
    const credentials = optionalCredentials(body.credentials);
    const source = await updateSource.execute({
      accountId,
      sourceId,
      ...(name !== undefined ? { name } : {}),
      ...(uriRef !== undefined ? { uriRef } : {}),
      ...(priority !== undefined ? { priority } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
      ...(credentials !== undefined ? { credentials } : {}),
    });
    return { statusCode: 200, headers: JSON_HEADERS, body: source };
  } catch (error: unknown) {
    return mapDomainError(error);
  }
}

async function handleDelete(
  request: HttpRequest,
  deleteSource: DeleteSource,
): Promise<HttpResponse> {
  const accountId = requireAccountId(request);
  if (typeof accountId !== 'string') {
    return accountId;
  }
  const sourceId = request.params?.id;
  if (!sourceId) {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: { error: 'Source id required' },
    };
  }
  try {
    await deleteSource.execute(accountId, sourceId);
    return { statusCode: 204, headers: JSON_HEADERS };
  } catch (error: unknown) {
    return mapDomainError(error);
  }
}

async function handleTest(
  request: HttpRequest,
  testSource: TestSource,
): Promise<HttpResponse> {
  const accountId = requireAccountId(request);
  if (typeof accountId !== 'string') {
    return accountId;
  }
  const sourceId = request.params?.id;
  if (!sourceId) {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: { error: 'Source id required' },
    };
  }
  try {
    const result = await testSource.execute(accountId, sourceId);
    return {
      statusCode: result.ok ? 200 : 422,
      headers: JSON_HEADERS,
      body: result,
    };
  } catch (error: unknown) {
    return mapDomainError(error);
  }
}

function requireAccountId(request: HttpRequest): string | HttpResponse {
  if (request.accountId === undefined || request.accountId === null) {
    return {
      statusCode: 401,
      headers: JSON_HEADERS,
      body: { error: 'Missing x-account-id (Sprint 0 stand-in for JWT)' },
    };
  }
  return request.accountId;
}

function mapDomainError(error: unknown): HttpResponse {
  if (error instanceof DomainError) {
    const statusCode =
      error.code === 'SOURCE_NOT_FOUND'
        ? 404
        : error.code === 'SOURCE_NOT_EDITABLE' ||
            error.code === 'SOURCE_NOT_DELETABLE' ||
            error.code === 'SOURCE_NOT_TESTABLE'
          ? 403
          : 400;
    return {
      statusCode,
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

function optionalCredentials(
  value: unknown,
): { username?: string; password?: string; token?: string } | undefined {
  const obj = asObject(value);
  if (!obj) {
    return undefined;
  }
  const username = optionalString(obj.username);
  const password = optionalString(obj.password);
  const token = optionalString(obj.token);
  return {
    ...(username !== undefined ? { username } : {}),
    ...(password !== undefined ? { password } : {}),
    ...(token !== undefined ? { token } : {}),
  };
}
