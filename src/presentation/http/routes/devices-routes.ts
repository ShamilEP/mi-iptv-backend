import { DomainError } from '../../../domain/shared/domain-error.js';
import type { DeviceHeartbeat } from '../../../application/devices/device-heartbeat.js';
import type { ListDevices } from '../../../application/devices/list-devices.js';
import type { RegisterDevice } from '../../../application/devices/register-device.js';
import type { UnlinkDevice } from '../../../application/devices/unlink-device.js';
import type {
  HttpRequest,
  HttpResponse,
  HttpRoute,
} from '../../../application/ports/http-server.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
} as const;

export function createDevicesRoutes(deps: {
  readonly listDevices: ListDevices;
  readonly registerDevice: RegisterDevice;
  readonly unlinkDevice: UnlinkDevice;
  readonly deviceHeartbeat: DeviceHeartbeat;
}): readonly HttpRoute[] {
  return [
    {
      method: 'GET',
      path: '/api/v1/devices',
      handler: (request) => handleList(request, deps.listDevices),
    },
    {
      method: 'POST',
      path: '/api/v1/devices/register',
      handler: (request) => handleRegister(request, deps.registerDevice),
    },
    {
      method: 'DELETE',
      path: '/api/v1/devices/{id}',
      handler: (request) => handleUnlink(request, deps.unlinkDevice),
    },
    {
      method: 'POST',
      path: '/api/v1/devices/{id}/heartbeat',
      handler: (request) => handleHeartbeat(request, deps.deviceHeartbeat),
    },
  ];
}

async function handleList(
  request: HttpRequest,
  listDevices: ListDevices,
): Promise<HttpResponse> {
  const accountId = requireAccountId(request);
  if (typeof accountId !== 'string') {
    return accountId;
  }
  const items = await listDevices.execute(accountId);
  return { statusCode: 200, headers: JSON_HEADERS, body: { items } };
}

async function handleRegister(
  request: HttpRequest,
  registerDevice: RegisterDevice,
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
    const name = optionalString(body.name);
    const model = optionalString(body.model);
    const appVersion = optionalString(body.appVersion);
    const osVersion = optionalString(body.osVersion);
    const pushToken = optionalString(body.pushToken);
    const device = await registerDevice.execute({
      accountId,
      deviceType: String(body.deviceType ?? ''),
      platform: String(body.platform ?? ''),
      ...(name !== undefined ? { name } : {}),
      ...(model !== undefined ? { model } : {}),
      ...(appVersion !== undefined ? { appVersion } : {}),
      ...(osVersion !== undefined ? { osVersion } : {}),
      ...(pushToken !== undefined ? { pushToken } : {}),
    });
    return { statusCode: 201, headers: JSON_HEADERS, body: device };
  } catch (error: unknown) {
    return mapDomainError(error);
  }
}

async function handleUnlink(
  request: HttpRequest,
  unlinkDevice: UnlinkDevice,
): Promise<HttpResponse> {
  const accountId = requireAccountId(request);
  if (typeof accountId !== 'string') {
    return accountId;
  }
  const deviceId = request.params?.id;
  if (!deviceId) {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: { error: 'Device id required' },
    };
  }
  try {
    await unlinkDevice.execute(accountId, deviceId);
    return { statusCode: 204, headers: JSON_HEADERS };
  } catch (error: unknown) {
    return mapDomainError(error);
  }
}

async function handleHeartbeat(
  request: HttpRequest,
  deviceHeartbeat: DeviceHeartbeat,
): Promise<HttpResponse> {
  const accountId = requireAccountId(request);
  if (typeof accountId !== 'string') {
    return accountId;
  }
  const deviceId = request.params?.id;
  if (!deviceId) {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: { error: 'Device id required' },
    };
  }
  const body = asObject(request.body) ?? {};
  try {
    const pushToken = optionalString(body.pushToken);
    const device = await deviceHeartbeat.execute({
      accountId,
      deviceId,
      ...(pushToken !== undefined ? { pushToken } : {}),
    });
    return { statusCode: 200, headers: JSON_HEADERS, body: device };
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
    const statusCode = error.code === 'DEVICE_NOT_FOUND' ? 404 : 400;
    return {
      statusCode,
      headers: JSON_HEADERS,
      body: { error: error.message, code: error.code },
    };
  }
  throw error;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value === 'undefined') {
    return null;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
