import type { CreateProfile } from '../../../application/profiles/create-profile.js';
import type { DeleteProfile } from '../../../application/profiles/delete-profile.js';
import type { GetProfile } from '../../../application/profiles/get-profile.js';
import type { ListProfiles } from '../../../application/profiles/list-profiles.js';
import type { UpdateProfile } from '../../../application/profiles/update-profile.js';
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

export function createProfilesRoutes(deps: {
  readonly listProfiles: ListProfiles;
  readonly getProfile: GetProfile;
  readonly createProfile: CreateProfile;
  readonly updateProfile: UpdateProfile;
  readonly deleteProfile: DeleteProfile;
}): readonly HttpRoute[] {
  return [
    {
      method: 'GET',
      path: '/api/v1/profiles',
      handler: (request) => handleList(request, deps.listProfiles),
    },
    {
      method: 'POST',
      path: '/api/v1/profiles',
      handler: (request) => handleCreate(request, deps.createProfile),
    },
    {
      method: 'GET',
      path: '/api/v1/profiles/{id}',
      handler: (request) => handleGetById(request, deps.getProfile),
    },
    {
      method: 'PATCH',
      path: '/api/v1/profiles/{id}',
      handler: (request) => handlePatchById(request, deps.updateProfile),
    },
    {
      method: 'DELETE',
      path: '/api/v1/profiles/{id}',
      handler: (request) => handleDelete(request, deps.deleteProfile),
    },
  ];
}

async function handleList(
  request: HttpRequest,
  listProfiles: ListProfiles,
): Promise<HttpResponse> {
  const accessToken = readBearerToken(request) ?? readBodyAccessToken(request);
  if (accessToken === null) {
    return unauthorized();
  }
  try {
    const body = await listProfiles.execute({ accessToken });
    return { statusCode: 200, headers: JSON_HEADERS, body };
  } catch (error: unknown) {
    return mapDomainError(error);
  }
}

async function handleCreate(
  request: HttpRequest,
  createProfile: CreateProfile,
): Promise<HttpResponse> {
  const accessToken = readBearerToken(request) ?? readBodyAccessToken(request);
  if (accessToken === null) {
    return unauthorized();
  }
  const body = asObject(request.body);
  if (!body || typeof body.name !== 'string') {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: {
        error: 'JSON body with name is required',
        code: 'PROFILE_INPUT_INVALID',
      },
    };
  }

  try {
    const result = await createProfile.execute({
      accessToken,
      name: body.name,
      ...parseMutableFields(body),
      ...(body.isDefault !== undefined
        ? { isDefault: Boolean(body.isDefault) }
        : {}),
    });
    return { statusCode: 201, headers: JSON_HEADERS, body: result };
  } catch (error: unknown) {
    return mapDomainError(error);
  }
}

async function handleGetById(
  request: HttpRequest,
  getProfile: GetProfile,
): Promise<HttpResponse> {
  const accessToken = readBearerToken(request) ?? readBodyAccessToken(request);
  if (accessToken === null) {
    return unauthorized();
  }
  const profileId = readPathId(request);
  if (profileId === null) {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: { error: 'profile id required', code: 'PROFILE_INPUT_INVALID' },
    };
  }
  try {
    const body = await getProfile.execute({ accessToken, profileId });
    return { statusCode: 200, headers: JSON_HEADERS, body };
  } catch (error: unknown) {
    return mapDomainError(error);
  }
}

async function handlePatchById(
  request: HttpRequest,
  updateProfile: UpdateProfile,
): Promise<HttpResponse> {
  const accessToken = readBearerToken(request) ?? readBodyAccessToken(request);
  if (accessToken === null) {
    return unauthorized();
  }
  const profileId = readPathId(request);
  if (profileId === null) {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: { error: 'profile id required', code: 'PROFILE_INPUT_INVALID' },
    };
  }
  const body = asObject(request.body);
  if (!body) {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: {
        error: 'JSON object body required',
        code: 'PROFILE_INPUT_INVALID',
      },
    };
  }

  try {
    const result = await updateProfile.execute({
      accessToken,
      profileId,
      ...parseMutableFields(body),
      ...(body.isDefault !== undefined
        ? { isDefault: Boolean(body.isDefault) }
        : {}),
    });
    return { statusCode: 200, headers: JSON_HEADERS, body: result };
  } catch (error: unknown) {
    return mapDomainError(error);
  }
}

async function handleDelete(
  request: HttpRequest,
  deleteProfile: DeleteProfile,
): Promise<HttpResponse> {
  const accessToken = readBearerToken(request) ?? readBodyAccessToken(request);
  if (accessToken === null) {
    return unauthorized();
  }
  const profileId = readPathId(request);
  if (profileId === null) {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: { error: 'profile id required', code: 'PROFILE_INPUT_INVALID' },
    };
  }
  try {
    const body = await deleteProfile.execute({ accessToken, profileId });
    return { statusCode: 200, headers: JSON_HEADERS, body };
  } catch (error: unknown) {
    return mapDomainError(error);
  }
}

function readPathId(request: HttpRequest): string | null {
  const profileId = request.params?.id;
  if (typeof profileId !== 'string' || profileId.trim() === '') {
    return null;
  }
  return profileId.trim();
}

function parseMutableFields(body: Record<string, unknown>): {
  readonly name?: string;
  readonly avatar?: string | null;
  readonly language?: string;
  readonly region?: string | null;
  readonly autoplay?: boolean;
  readonly subtitlePrefs?: Record<string, unknown>;
} {
  return {
    ...(body.name !== undefined ? { name: String(body.name) } : {}),
    ...(Object.prototype.hasOwnProperty.call(body, 'avatar')
      ? { avatar: body.avatar === null ? null : String(body.avatar) }
      : {}),
    ...(body.language !== undefined
      ? { language: String(body.language) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(body, 'region')
      ? { region: body.region === null ? null : String(body.region) }
      : {}),
    ...(body.autoplay !== undefined
      ? { autoplay: Boolean(body.autoplay) }
      : {}),
    ...(body.subtitlePrefs !== undefined &&
    body.subtitlePrefs !== null &&
    typeof body.subtitlePrefs === 'object' &&
    !Array.isArray(body.subtitlePrefs)
      ? {
          subtitlePrefs: body.subtitlePrefs as Record<string, unknown>,
        }
      : {}),
  };
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
  const body = asObject(request.body);
  if (!body) {
    return null;
  }
  const token = body.accessToken;
  return typeof token === 'string' && token.trim() !== ''
    ? token.trim()
    : null;
}

function asObject(body: unknown): Record<string, unknown> | null {
  if (body === null || typeof body === 'undefined') {
    return null;
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  return body as Record<string, unknown>;
}

function mapDomainError(error: unknown): HttpResponse {
  if (error instanceof DomainError) {
    const statusCode =
      error.code === 'PROFILE_NOT_FOUND'
        ? 404
        : error.code === 'PROFILE_LIMIT_REACHED' ||
            error.code === 'PROFILE_LAST_REMAINING'
          ? 409
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
