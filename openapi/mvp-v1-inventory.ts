/**
 * Frozen MVP HTTP/WSS surface for BE-003 / ADR-010 (Package A).
 * OpenAPI must include every entry. Implemented routes also appear in ROUTE_CATALOG.
 * EPG is Release 1 and intentionally omitted.
 */
export type MvpOperation = {
  readonly method: string;
  readonly path: string;
  readonly operationId: string;
  readonly implemented: boolean;
};

export const MVP_V1_OPERATIONS: readonly MvpOperation[] = [
  { method: 'GET', path: '/health', operationId: 'getHealth', implemented: true },

  { method: 'POST', path: '/api/v1/auth/register', operationId: 'register', implemented: true },
  { method: 'POST', path: '/api/v1/auth/login', operationId: 'login', implemented: true },
  { method: 'POST', path: '/api/v1/auth/refresh', operationId: 'refresh', implemented: true },
  { method: 'POST', path: '/api/v1/auth/logout', operationId: 'logout', implemented: true },
  {
    method: 'POST',
    path: '/api/v1/auth/reset-password',
    operationId: 'requestPasswordReset',
    implemented: false,
  },
  {
    method: 'POST',
    path: '/api/v1/auth/reset-password/confirm',
    operationId: 'confirmPasswordReset',
    implemented: false,
  },

  {
    method: 'GET',
    path: '/api/v1/account/export',
    operationId: 'exportAccountData',
    implemented: true,
  },
  { method: 'DELETE', path: '/api/v1/account', operationId: 'deleteAccount', implemented: true },

  { method: 'GET', path: '/api/v1/profiles', operationId: 'listProfiles', implemented: true },
  { method: 'POST', path: '/api/v1/profiles', operationId: 'createProfile', implemented: true },
  { method: 'GET', path: '/api/v1/profiles/{id}', operationId: 'getProfile', implemented: true },
  { method: 'PATCH', path: '/api/v1/profiles/{id}', operationId: 'updateProfile', implemented: true },
  {
    method: 'DELETE',
    path: '/api/v1/profiles/{id}',
    operationId: 'deleteProfile',
    implemented: true,
  },
  {
    method: 'PUT',
    path: '/api/v1/profiles/{id}/pin',
    operationId: 'setParentalPin',
    implemented: true,
  },
  {
    method: 'POST',
    path: '/api/v1/profiles/{id}/verify-pin',
    operationId: 'verifyParentalPin',
    implemented: true,
  },
  {
    method: 'PATCH',
    path: '/api/v1/profiles/{id}/restrictions',
    operationId: 'updateProfileRestrictions',
    implemented: true,
  },
  {
    method: 'GET',
    path: '/api/v1/profiles/{id}/history',
    operationId: 'listWatchHistory',
    implemented: true,
  },
  {
    method: 'POST',
    path: '/api/v1/profiles/{id}/history',
    operationId: 'recordWatchHistory',
    implemented: true,
  },
  {
    method: 'DELETE',
    path: '/api/v1/profiles/{id}/history',
    operationId: 'clearWatchHistory',
    implemented: true,
  },
  {
    method: 'GET',
    path: '/api/v1/profiles/{id}/privacy',
    operationId: 'getWatchHistoryPrivacy',
    implemented: true,
  },
  {
    method: 'PATCH',
    path: '/api/v1/profiles/{id}/privacy',
    operationId: 'updateWatchHistoryPrivacy',
    implemented: true,
  },

  { method: 'GET', path: '/api/v1/sources', operationId: 'listSources', implemented: true },
  { method: 'POST', path: '/api/v1/sources', operationId: 'createSource', implemented: true },
  { method: 'PATCH', path: '/api/v1/sources/{id}', operationId: 'updateSource', implemented: true },
  { method: 'DELETE', path: '/api/v1/sources/{id}', operationId: 'deleteSource', implemented: true },
  {
    method: 'POST',
    path: '/api/v1/sources/{id}/test',
    operationId: 'testSource',
    implemented: true,
  },

  {
    method: 'GET',
    path: '/api/v1/catalog/channels',
    operationId: 'listCatalogChannels',
    implemented: false,
  },
  {
    method: 'GET',
    path: '/api/v1/catalog/vod',
    operationId: 'listCatalogVod',
    implemented: false,
  },
  {
    method: 'GET',
    path: '/api/v1/catalog/search',
    operationId: 'searchCatalog',
    implemented: false,
  },
  {
    method: 'GET',
    path: '/api/v1/catalog/items/{id}',
    operationId: 'getCatalogItem',
    implemented: false,
  },

  {
    method: 'GET',
    path: '/api/v1/sync/state',
    operationId: 'getSyncState',
    implemented: true,
  },
  {
    method: 'POST',
    path: '/api/v1/sync/playback-state',
    operationId: 'upsertPlaybackState',
    implemented: true,
  },
  {
    method: 'GET',
    path: '/api/v1/sync/playback-history',
    operationId: 'listPlaybackHistory',
    implemented: true,
  },
  {
    method: 'GET',
    path: '/api/v1/sync/favorites',
    operationId: 'listFavorites',
    implemented: true,
  },
  {
    method: 'POST',
    path: '/api/v1/sync/favorites',
    operationId: 'setFavorite',
    implemented: true,
  },
  {
    method: 'GET',
    path: '/api/v1/sync/settings',
    operationId: 'getProfileSettings',
    implemented: true,
  },
  {
    method: 'POST',
    path: '/api/v1/sync/settings',
    operationId: 'upsertProfileSettings',
    implemented: true,
  },
  {
    method: 'POST',
    path: '/api/v1/sync/events',
    operationId: 'acceptBatchedSyncEvents',
    implemented: true,
  },

  { method: 'GET', path: '/api/v1/devices', operationId: 'listDevices', implemented: true },
  {
    method: 'POST',
    path: '/api/v1/devices/register',
    operationId: 'registerDevice',
    implemented: true,
  },
  {
    method: 'POST',
    path: '/api/v1/devices/companion-status',
    operationId: 'notifyCompanionStatus',
    implemented: true,
  },
  { method: 'DELETE', path: '/api/v1/devices/{id}', operationId: 'unlinkDevice', implemented: true },
  {
    method: 'POST',
    path: '/api/v1/devices/{id}/heartbeat',
    operationId: 'deviceHeartbeat',
    implemented: true,
  },
  {
    method: 'POST',
    path: '/api/v1/devices/{id}/send-to-tv',
    operationId: 'sendToTv',
    implemented: false,
  },

  {
    method: 'POST',
    path: '/api/v1/diagnostics/qoe',
    operationId: 'ingestQoeEvents',
    implemented: false,
  },
  {
    method: 'GET',
    path: '/api/v1/diagnostics/network',
    operationId: 'networkDiagnostics',
    implemented: false,
  },

  {
    method: 'GET',
    path: '/realtime',
    operationId: 'realtimeHandshake',
    implemented: false,
  },
] as const;
