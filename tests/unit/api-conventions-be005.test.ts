import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  API_V1_PREFIX,
  isAllowedPublicApiPath,
  isApiV1Path,
  isUnversionedPublicPath,
} from '../../src/domain/api/api-versioning.js';
import { buildErrorEnvelope } from '../../src/domain/api/error-envelope.js';
import {
  CATALOG_PAGINATION,
  SEARCH_PAGINATION,
  buildCursorPage,
  parsePaginationQuery,
} from '../../src/domain/api/pagination.js';
import {
  serverNowUtc,
  serverTimestampNow,
  toServerTimestamp,
} from '../../src/domain/api/server-clock.js';
import { DomainError } from '../../src/domain/shared/domain-error.js';
import { parseClientEventId } from '../../src/domain/sync/client-event-id.js';
import { replayIfDuplicate } from '../../src/domain/sync/idempotency.js';
import { TRACE_HEADER, resolveTraceId } from '../../src/shared/trace-id.js';
import { repoRoot } from '../../scripts/openapi/load-openapi.js';

describe('BE-005 API conventions', () => {
  it('builds the canonical error envelope', () => {
    assert.deepEqual(
      buildErrorEnvelope({
        error: 'Not Found',
        code: 'NOT_FOUND',
        traceId: '11111111-1111-4111-8111-111111111111',
      }),
      {
        error: 'Not Found',
        code: 'NOT_FOUND',
        traceId: '11111111-1111-4111-8111-111111111111',
      },
    );
  });

  it('parses cursor pagination with defaults and bounds', () => {
    assert.deepEqual(parsePaginationQuery({}, CATALOG_PAGINATION), {
      cursor: null,
      limit: 50,
    });
    assert.deepEqual(
      parsePaginationQuery({ cursor: ' abc ', limit: '10' }, SEARCH_PAGINATION),
      { cursor: 'abc', limit: 10 },
    );
    assert.throws(
      () => parsePaginationQuery({ limit: 0 }, CATALOG_PAGINATION),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'PAGINATION_LIMIT_INVALID',
    );
  });

  it('builds cursor pages', () => {
    assert.deepEqual(buildCursorPage([{ id: '1' }], 'next'), {
      items: [{ id: '1' }],
      nextCursor: 'next',
    });
  });

  it('keeps business routes under /api/v1 with health/realtime exceptions', () => {
    assert.equal(API_V1_PREFIX, '/api/v1');
    assert.equal(isApiV1Path('/api/v1/auth/login'), true);
    assert.equal(isUnversionedPublicPath('/health'), true);
    assert.equal(isUnversionedPublicPath('/realtime'), true);
    assert.equal(isAllowedPublicApiPath('/api/v1/sources'), true);
    assert.equal(isAllowedPublicApiPath('/v1/sources'), false);
  });

  it('emits UTC server timestamps', () => {
    const fixed = new Date('2026-11-16T22:00:00.000Z');
    assert.equal(serverNowUtc(() => fixed).toISOString(), fixed.toISOString());
    assert.equal(toServerTimestamp(fixed), '2026-11-16T22:00:00.000Z');
    assert.equal(serverTimestampNow(() => fixed), '2026-11-16T22:00:00.000Z');
  });

  it('propagates or generates x-trace-id', () => {
    assert.equal(
      resolveTraceId({ [TRACE_HEADER]: 'trace-from-client' }),
      'trace-from-client',
    );
    const generated = resolveTraceId({});
    assert.match(
      generated,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('documents clientEventId idempotency rules via existing sync helpers', () => {
    const id = parseClientEventId('550e8400-e29b-41d4-a716-446655440000');
    assert.equal(id, '550e8400-e29b-41d4-a716-446655440000');
    const replay = replayIfDuplicate(
      {
        entity: 'playback_state',
        operation: 'upsert',
        accepted: true,
        resolvedBy: 'accepted',
        resultVersion: 2,
        changeSeq: 10,
      },
      3,
    );
    assert.deepEqual(replay, {
      accepted: true,
      resolvedBy: 'accepted',
      resultVersion: 3,
      isReplay: true,
    });
  });

  it('publishes ErrorEnvelope and CursorPage in OpenAPI', () => {
    const doc = JSON.parse(
      readFileSync(join(repoRoot(), 'openapi', 'openapi.json'), 'utf8'),
    ) as {
      components?: {
        schemas?: Record<string, unknown>;
        parameters?: Record<string, unknown>;
      };
      info?: { description?: string };
    };
    assert.ok(doc.components?.schemas?.ErrorEnvelope);
    assert.ok(doc.components?.schemas?.CursorPage);
    assert.ok(doc.components?.parameters?.XTraceId);
    assert.ok(doc.components?.parameters?.PageCursor);
    assert.match(doc.info?.description ?? '', /BE-005/);
  });
});
