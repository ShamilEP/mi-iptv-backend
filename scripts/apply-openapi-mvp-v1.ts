/**
 * One-shot merge of BE-003 MVP freeze paths into openapi/openapi.json.
 * Safe to re-run: overwrites only the operations defined here.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const openApiPath = join(root, 'openapi', 'openapi.json');

const accountHeader = {
  name: 'x-account-id',
  in: 'header',
  required: true,
  schema: { type: 'string', format: 'uuid' },
} as const;

const deviceHeader = {
  name: 'x-device-id',
  in: 'header',
  required: true,
  schema: { type: 'string', format: 'uuid' },
} as const;

const authError = {
  description: 'Client error',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/AuthError' },
    },
  },
};

const jsonRef = (ref: string) => ({
  content: {
    'application/json': {
      schema: { $ref: `#/components/schemas/${ref}` },
    },
  },
});

const newPaths: Record<string, Record<string, unknown>> = {
  '/api/v1/auth/reset-password': {
    post: {
      operationId: 'requestPasswordReset',
      summary: 'Request a password-reset email',
      description:
        'Sends a single-use, short-lived reset token by email when the account exists. Response is always 202 to avoid email enumeration (BE-026).',
      tags: ['auth'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/RequestPasswordResetRequest' },
          },
        },
      },
      responses: {
        '202': {
          description: 'Accepted (email sent only if the account exists)',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RequestPasswordResetResponse' },
            },
          },
        },
        '400': authError,
      },
    },
  },
  '/api/v1/auth/reset-password/confirm': {
    post: {
      operationId: 'confirmPasswordReset',
      summary: 'Confirm password reset with token',
      description:
        'Sets a new password using a valid reset token and invalidates existing sessions (ADR-010 / BE-026).',
      tags: ['auth'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ConfirmPasswordResetRequest' },
          },
        },
      },
      responses: {
        '204': { description: 'Password updated; sessions revoked' },
        '400': authError,
        '401': authError,
      },
    },
  },
  '/api/v1/catalog/channels': {
    get: {
      operationId: 'listCatalogChannels',
      summary: 'List normalized live channels',
      description: 'Merged user sources + proprietary catalog with optional filters and pagination (BE-050).',
      tags: ['catalog'],
      parameters: [
        accountHeader,
        {
          name: 'group',
          in: 'query',
          required: false,
          schema: { type: 'string' },
        },
        {
          name: 'language',
          in: 'query',
          required: false,
          schema: { type: 'string' },
        },
        {
          name: 'country',
          in: 'query',
          required: false,
          schema: { type: 'string' },
        },
        {
          name: 'cursor',
          in: 'query',
          required: false,
          schema: { type: 'string' },
        },
        {
          name: 'limit',
          in: 'query',
          required: false,
          schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
        },
      ],
      responses: {
        '200': {
          description: 'Channel page',
          ...jsonRef('CatalogListResponse'),
        },
      },
    },
  },
  '/api/v1/catalog/vod': {
    get: {
      operationId: 'listCatalogVod',
      summary: 'List VOD home rows / carousels',
      description: 'Home rows by type, source, and genre (BE-051).',
      tags: ['catalog'],
      parameters: [
        accountHeader,
        {
          name: 'type',
          in: 'query',
          required: false,
          schema: { type: 'string', enum: ['vod_movie', 'vod_series'] },
        },
        {
          name: 'genre',
          in: 'query',
          required: false,
          schema: { type: 'string' },
        },
        {
          name: 'sourceId',
          in: 'query',
          required: false,
          schema: { type: 'string', format: 'uuid' },
        },
        {
          name: 'cursor',
          in: 'query',
          required: false,
          schema: { type: 'string' },
        },
        {
          name: 'limit',
          in: 'query',
          required: false,
          schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
        },
      ],
      responses: {
        '200': {
          description: 'VOD rows',
          ...jsonRef('CatalogListResponse'),
        },
      },
    },
  },
  '/api/v1/catalog/search': {
    get: {
      operationId: 'searchCatalog',
      summary: 'Search catalog by title, channel, or genre',
      tags: ['catalog'],
      parameters: [
        accountHeader,
        {
          name: 'q',
          in: 'query',
          required: true,
          schema: { type: 'string', minLength: 1 },
        },
        {
          name: 'limit',
          in: 'query',
          required: false,
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      ],
      responses: {
        '200': {
          description: 'Search hits',
          ...jsonRef('CatalogListResponse'),
        },
        '400': authError,
      },
    },
  },
  '/api/v1/catalog/items/{id}': {
    get: {
      operationId: 'getCatalogItem',
      summary: 'Content detail',
      description:
        'Canonical item with synopsis, artwork, duration, and stream metadata (FR-012 / ADR-010). Never returns clear source credentials.',
      tags: ['catalog'],
      parameters: [
        accountHeader,
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      responses: {
        '200': {
          description: 'Item detail',
          ...jsonRef('CatalogItemDetail'),
        },
        '404': authError,
      },
    },
  },
  '/api/v1/sync/state': {
    get: {
      operationId: 'getSyncState',
      summary: 'Pull sync deltas by change_seq cursor',
      description:
        'Returns playback_state, favorite, and source deltas with change_seq > cursor (ADR-005 / ADR-009). Sources are metadata-only (no credentials). If cursor < tombstoneFloor, clients must full-resync.',
      tags: ['sync'],
      parameters: [
        accountHeader,
        {
          name: 'cursor',
          in: 'query',
          required: false,
          description: 'Last applied account change_seq (default 0)',
          schema: { type: 'integer', format: 'int64', minimum: 0, default: 0 },
        },
        {
          name: 'limit',
          in: 'query',
          required: false,
          schema: { type: 'integer', minimum: 1, maximum: 500, default: 500 },
        },
      ],
      responses: {
        '200': {
          description: 'Delta page',
          ...jsonRef('SyncStateResponse'),
        },
        '409': {
          description: 'Cursor behind tombstone floor — full resync required',
          ...jsonRef('SyncFullResyncRequired'),
        },
      },
    },
  },
  '/api/v1/devices/{id}/send-to-tv': {
    post: {
      operationId: 'sendToTv',
      summary: 'Send content to a target TV',
      description:
        'Path {id} is the sender device; body targetDeviceId is the TV (ADR-008). Offline TVs queue play for 5 minutes.',
      tags: ['devices'],
      parameters: [
        accountHeader,
        deviceHeader,
        {
          name: 'id',
          in: 'path',
          required: true,
          description: 'Sender device id (must match authenticated device)',
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/SendToTvRequest' },
          },
        },
      },
      responses: {
        '202': {
          description: 'Accepted (delivered or queued)',
          ...jsonRef('SendToTvResponse'),
        },
        '400': authError,
        '403': authError,
        '404': authError,
      },
    },
  },
  '/api/v1/diagnostics/qoe': {
    post: {
      operationId: 'ingestQoeEvents',
      summary: 'Ingest anonymous QoE telemetry',
      description:
        'Batch QoE events (FR-029). Honor client telemetry opt-out; store anonymous session ids only (SEC-040).',
      tags: ['diagnostics'],
      parameters: [accountHeader],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/IngestQoeRequest' },
          },
        },
      },
      responses: {
        '202': {
          description: 'Accepted (or no-op when opt-out)',
          ...jsonRef('IngestQoeResponse'),
        },
        '400': authError,
      },
    },
  },
  '/api/v1/diagnostics/network': {
    get: {
      operationId: 'networkDiagnostics',
      summary: 'Lightweight network latency probe',
      description: 'Supports the client diagnostics screen (FR-028 / BE-092).',
      tags: ['diagnostics'],
      responses: {
        '200': {
          description: 'Server timestamp for RTT measurement',
          ...jsonRef('NetworkDiagnosticsResponse'),
        },
      },
    },
  },
  '/realtime': {
    get: {
      operationId: 'realtimeHandshake',
      summary: 'Authenticated WebSocket upgrade (WSS)',
      description:
        'Primary realtime transport (ADR-007 / PRD-027). Clients upgrade this HTTP GET to WebSocket with JWT access token and deviceId (query or header). Per-device channels, heartbeat, reconnect/resume, and connection limits are enforced by BE-077. Not SSE. Push (FCM/APNs) is fallback only when no socket is open.',
      tags: ['realtime'],
      parameters: [
        {
          name: 'access_token',
          in: 'query',
          required: false,
          description: 'JWT access token when the client cannot set Upgrade Authorization',
          schema: { type: 'string' },
        },
        {
          name: 'deviceId',
          in: 'query',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
        {
          name: 'Authorization',
          in: 'header',
          required: false,
          schema: { type: 'string' },
          description: 'Bearer access JWT (preferred over query token)',
        },
      ],
      responses: {
        '101': {
          description: 'Switching Protocols — WebSocket session established',
        },
        '401': authError,
        '403': authError,
        '429': {
          description: 'Connection limit exceeded',
          ...jsonRef('AuthError'),
        },
      },
    },
  },
};

const newSchemas: Record<string, unknown> = {
  RequestPasswordResetRequest: {
    type: 'object',
    required: ['email'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', format: 'email' },
    },
  },
  RequestPasswordResetResponse: {
    type: 'object',
    required: ['status'],
    additionalProperties: false,
    properties: {
      status: { type: 'string', enum: ['accepted'] },
    },
  },
  ConfirmPasswordResetRequest: {
    type: 'object',
    required: ['token', 'newPassword'],
    additionalProperties: false,
    properties: {
      token: { type: 'string', minLength: 1 },
      newPassword: { type: 'string', minLength: 8 },
    },
  },
  CatalogListResponse: {
    type: 'object',
    required: ['items'],
    additionalProperties: false,
    properties: {
      items: {
        type: 'array',
        items: { $ref: '#/components/schemas/CatalogItemSummary' },
      },
      nextCursor: { type: ['string', 'null'] },
    },
  },
  CatalogItemSummary: {
    type: 'object',
    required: ['id', 'type', 'title'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', format: 'uuid' },
      type: {
        type: 'string',
        enum: ['channel', 'vod_movie', 'vod_series', 'episode'],
      },
      title: { type: 'string' },
      artwork: { $ref: '#/components/schemas/CatalogArtwork' },
      genres: { type: 'array', items: { type: 'string' } },
    },
  },
  CatalogArtwork: {
    type: 'object',
    additionalProperties: false,
    properties: {
      poster: { type: ['string', 'null'], format: 'uri' },
      banner: { type: ['string', 'null'], format: 'uri' },
    },
  },
  CatalogItemDetail: {
    type: 'object',
    required: ['id', 'type', 'title'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', format: 'uuid' },
      type: {
        type: 'string',
        enum: ['channel', 'vod_movie', 'vod_series', 'episode'],
      },
      title: { type: 'string' },
      synopsis: { type: ['string', 'null'] },
      durationSec: { type: ['integer', 'null'], minimum: 0 },
      artwork: { $ref: '#/components/schemas/CatalogArtwork' },
      genres: { type: 'array', items: { type: 'string' } },
      streams: {
        type: 'array',
        items: { $ref: '#/components/schemas/CatalogStreamRef' },
      },
    },
  },
  CatalogStreamRef: {
    type: 'object',
    required: ['sourceId', 'protocol'],
    additionalProperties: false,
    properties: {
      sourceId: { type: 'string', format: 'uuid' },
      protocol: { type: 'string', enum: ['hls', 'dash', 'ts'] },
      priority: { type: 'integer' },
    },
  },
  SyncStateResponse: {
    type: 'object',
    required: ['changes', 'nextCursor', 'serverTimestamp'],
    additionalProperties: false,
    properties: {
      changes: {
        type: 'array',
        items: { $ref: '#/components/schemas/SyncDeltaChange' },
      },
      nextCursor: { type: 'integer', format: 'int64' },
      serverTimestamp: { type: 'string', format: 'date-time' },
      truncated: { type: 'boolean', default: false },
    },
  },
  SyncDeltaChange: {
    type: 'object',
    required: ['entity', 'seq', 'deleted', 'payload'],
    additionalProperties: false,
    properties: {
      entity: {
        type: 'string',
        enum: ['playback_state', 'favorite', 'source'],
      },
      seq: { type: 'integer', format: 'int64' },
      deleted: { type: 'boolean' },
      payload: { type: 'object', additionalProperties: true },
    },
  },
  SyncFullResyncRequired: {
    type: 'object',
    required: ['code', 'tombstoneFloor'],
    additionalProperties: false,
    properties: {
      code: { type: 'string', enum: ['SYNC_FULL_RESYNC_REQUIRED'] },
      tombstoneFloor: { type: 'integer', format: 'int64' },
      message: { type: 'string' },
    },
  },
  SendToTvRequest: {
    type: 'object',
    required: ['targetDeviceId', 'contentId', 'sourceId', 'action'],
    additionalProperties: false,
    properties: {
      targetDeviceId: { type: 'string', format: 'uuid' },
      contentId: { type: 'string' },
      sourceId: { type: 'string', format: 'uuid' },
      action: { type: 'string', enum: ['play'] },
      startPositionSec: { type: 'integer', minimum: 0 },
    },
  },
  SendToTvResponse: {
    type: 'object',
    required: ['commandId', 'status', 'expiresAt'],
    additionalProperties: false,
    properties: {
      commandId: { type: 'string', format: 'uuid' },
      status: {
        type: 'string',
        enum: ['queued', 'delivered'],
      },
      expiresAt: { type: 'string', format: 'date-time' },
    },
  },
  IngestQoeRequest: {
    type: 'object',
    required: ['anonymousSessionId', 'events'],
    additionalProperties: false,
    properties: {
      anonymousSessionId: { type: 'string', minLength: 1 },
      telemetryOptIn: { type: 'boolean', default: true },
      appVersion: { type: 'string' },
      deviceModel: { type: 'string' },
      events: {
        type: 'array',
        minItems: 1,
        maxItems: 100,
        items: { $ref: '#/components/schemas/QoeEvent' },
      },
    },
  },
  QoeEvent: {
    type: 'object',
    required: ['sourceProvider'],
    additionalProperties: false,
    properties: {
      sourceProvider: { type: 'string' },
      timeToFirstFrameMs: { type: 'integer', minimum: 0 },
      rebufferEventsCount: { type: 'integer', minimum: 0 },
      rebufferDurationMs: { type: 'integer', minimum: 0 },
      streamErrorsCount: { type: 'integer', minimum: 0 },
    },
  },
  IngestQoeResponse: {
    type: 'object',
    required: ['accepted'],
    additionalProperties: false,
    properties: {
      accepted: { type: 'integer', minimum: 0 },
      skippedOptOut: { type: 'boolean' },
    },
  },
  NetworkDiagnosticsResponse: {
    type: 'object',
    required: ['serverTimestamp'],
    additionalProperties: false,
    properties: {
      serverTimestamp: { type: 'string', format: 'date-time' },
    },
  },
};

function main(): void {
  const doc = JSON.parse(readFileSync(openApiPath, 'utf8')) as {
    openapi: string;
    info: Record<string, unknown>;
    paths: Record<string, Record<string, unknown>>;
    components: { schemas: Record<string, unknown> };
    tags?: Array<{ name: string; description?: string }>;
  };

  doc.info.version = '1.0.0';
  doc.info.description =
    'Mi IPTV Backend API — **MVP OpenAPI v1 freeze (BE-003 / ADR-010 Package A)**. Public REST under `/api/v1`; `/health` is the ALB probe; `/realtime` is the authenticated WSS upgrade. EPG is Release 1 and omitted. Favorites live under `/sync/favorites`.';

  doc.tags = [
    { name: 'auth', description: 'Account authentication and password reset' },
    { name: 'account', description: 'Account export and deletion' },
    { name: 'profiles', description: 'Profiles, parental controls, watch history' },
    { name: 'sources', description: 'IPTV source registry' },
    { name: 'catalog', description: 'Normalized channels, VOD, search, detail' },
    { name: 'sync', description: 'Offline-first sync (playback, favorites, settings, sources delta)' },
    { name: 'devices', description: 'Device registry, heartbeat, send-to-TV, companion status' },
    { name: 'diagnostics', description: 'QoE and network diagnostics' },
    { name: 'realtime', description: 'WebSocket companion↔TV control (ADR-007)' },
    { name: 'ops', description: 'Operational probes' },
  ];

  for (const [path, methods] of Object.entries(newPaths)) {
    doc.paths[path] = { ...(doc.paths[path] ?? {}), ...methods };
  }

  doc.components.schemas = {
    ...doc.components.schemas,
    ...newSchemas,
  };

  writeFileSync(openApiPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  console.log(
    `Updated ${openApiPath} to version ${String(doc.info.version)} (${Object.keys(doc.paths).length} paths).`,
  );
}

main();
