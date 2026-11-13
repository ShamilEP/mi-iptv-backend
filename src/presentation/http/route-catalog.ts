import type { HttpMethod } from '../../application/ports/http-server.js';

/**
 * Presentation routes that must stay aligned with `openapi/openapi.json`.
 * When adding an HTTP route, update this catalog and the OpenAPI document together.
 */
export type RouteCatalogEntry = {
  readonly method: HttpMethod;
  readonly path: string;
  readonly operationId: string;
};

export const ROUTE_CATALOG: readonly RouteCatalogEntry[] = [
  {
    method: 'GET',
    path: '/health',
    operationId: 'getHealth',
  },
  {
    method: 'POST',
    path: '/api/v1/auth/login',
    operationId: 'login',
  },
  {
    method: 'POST',
    path: '/api/v1/auth/refresh',
    operationId: 'refresh',
  },
  {
    method: 'GET',
    path: '/api/v1/sources',
    operationId: 'listSources',
  },
  {
    method: 'POST',
    path: '/api/v1/sources',
    operationId: 'createSource',
  },
  {
    method: 'PATCH',
    path: '/api/v1/sources/{id}',
    operationId: 'updateSource',
  },
  {
    method: 'DELETE',
    path: '/api/v1/sources/{id}',
    operationId: 'deleteSource',
  },
  {
    method: 'POST',
    path: '/api/v1/sources/{id}/test',
    operationId: 'testSource',
  },
  {
    method: 'GET',
    path: '/api/v1/devices',
    operationId: 'listDevices',
  },
  {
    method: 'POST',
    path: '/api/v1/devices/register',
    operationId: 'registerDevice',
  },
  {
    method: 'DELETE',
    path: '/api/v1/devices/{id}',
    operationId: 'unlinkDevice',
  },
  {
    method: 'POST',
    path: '/api/v1/devices/{id}/heartbeat',
    operationId: 'deviceHeartbeat',
  },
  {
    method: 'POST',
    path: '/api/v1/sync/playback-state',
    operationId: 'upsertPlaybackState',
  },
] as const;
