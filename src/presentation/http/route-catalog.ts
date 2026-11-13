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
    path: '/api/v1/auth/register',
    operationId: 'register',
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
    method: 'POST',
    path: '/api/v1/auth/logout',
    operationId: 'logout',
  },
  {
    method: 'GET',
    path: '/api/v1/account/export',
    operationId: 'exportAccountData',
  },
  {
    method: 'DELETE',
    path: '/api/v1/account',
    operationId: 'deleteAccount',
  },
  {
    method: 'GET',
    path: '/api/v1/profiles',
    operationId: 'listProfiles',
  },
  {
    method: 'POST',
    path: '/api/v1/profiles',
    operationId: 'createProfile',
  },
  {
    method: 'GET',
    path: '/api/v1/profiles/{id}',
    operationId: 'getProfile',
  },
  {
    method: 'PATCH',
    path: '/api/v1/profiles/{id}',
    operationId: 'updateProfile',
  },
  {
    method: 'DELETE',
    path: '/api/v1/profiles/{id}',
    operationId: 'deleteProfile',
  },
  {
    method: 'PUT',
    path: '/api/v1/profiles/{id}/pin',
    operationId: 'setParentalPin',
  },
  {
    method: 'POST',
    path: '/api/v1/profiles/{id}/verify-pin',
    operationId: 'verifyParentalPin',
  },
  {
    method: 'PATCH',
    path: '/api/v1/profiles/{id}/restrictions',
    operationId: 'updateProfileRestrictions',
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
    method: 'POST',
    path: '/api/v1/devices/companion-status',
    operationId: 'notifyCompanionStatus',
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
  {
    method: 'GET',
    path: '/api/v1/sync/playback-history',
    operationId: 'listPlaybackHistory',
  },
  {
    method: 'GET',
    path: '/api/v1/sync/favorites',
    operationId: 'listFavorites',
  },
  {
    method: 'POST',
    path: '/api/v1/sync/favorites',
    operationId: 'setFavorite',
  },
  {
    method: 'POST',
    path: '/api/v1/sync/events',
    operationId: 'acceptBatchedSyncEvents',
  },
] as const;
