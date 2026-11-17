import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { IngestQoeEvents } from '../../src/application/diagnostics/ingest-qoe-events.js';
import { DomainError } from '../../src/domain/shared/domain-error.js';
import { QOE_BATCH_MAX_EVENTS } from '../../src/domain/telemetry/qoe-batch.js';
import { InMemoryQoeEventRepository } from '../../src/infrastructure/persistence/in-memory-qoe-event-repository.js';
import { MVP_V1_OPERATIONS } from '../../openapi/mvp-v1-inventory.js';
import { createDiagnosticsRoutes } from '../../src/presentation/http/routes/diagnostics-routes.js';
import { ROUTE_CATALOG } from '../../src/presentation/http/route-catalog.js';

const sessionId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function buildApi() {
  const repository = new InMemoryQoeEventRepository();
  const ingest = new IngestQoeEvents(repository);
  return { repository, ingest };
}

describe('IngestQoeEvents (BE-090)', () => {
  it('accepts a validated batch with metrics by source provider', async () => {
    const api = buildApi();
    const result = await api.ingest.execute({
      anonymousSessionId: sessionId,
      appVersion: '1.2.3',
      deviceModel: 'Shield',
      events: [
        {
          sourceProvider: 'acme-iptv',
          timeToFirstFrameMs: 420,
          rebufferEventsCount: 1,
          rebufferDurationMs: 250,
          streamErrorsCount: 0,
        },
        {
          sourceProvider: 'other',
          timeToFirstFrameMs: 900,
          streamErrorsCount: 2,
        },
      ],
    });

    assert.equal(result.accepted, 2);
    assert.equal(result.skippedOptOut, undefined);
    const rows = api.repository.listAll();
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.anonymousSessionId, sessionId);
    assert.equal(rows[0]?.sourceProvider, 'acme-iptv');
    assert.equal(rows[0]?.timeToFirstFrameMs, 420);
    assert.equal(rows[0]?.appVersion, '1.2.3');
    assert.equal(rows[0]?.deviceModel, 'Shield');
    assert.ok(
      rows.every(
        (row) => !('accountId' in row) && !Object.keys(row).includes('email'),
      ),
    );
  });

  it('no-ops when telemetryOptIn is false', async () => {
    const api = buildApi();
    const result = await api.ingest.execute({
      anonymousSessionId: sessionId,
      telemetryOptIn: false,
      events: [{ sourceProvider: 'acme-iptv', timeToFirstFrameMs: 10 }],
    });
    assert.deepEqual(result, { accepted: 0, skippedOptOut: true });
    assert.equal(api.repository.listAll().length, 0);
  });

  it('rejects empty, oversized, or invalid batches', async () => {
    const api = buildApi();
    await assert.rejects(
      () =>
        api.ingest.execute({
          anonymousSessionId: sessionId,
          events: [],
        }),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'QOE_BATCH_INVALID',
    );

    await assert.rejects(
      () =>
        api.ingest.execute({
          anonymousSessionId: sessionId,
          events: Array.from({ length: QOE_BATCH_MAX_EVENTS + 1 }, () => ({
            sourceProvider: 'x',
          })),
        }),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'QOE_BATCH_TOO_LARGE',
    );

    await assert.rejects(
      () =>
        api.ingest.execute({
          anonymousSessionId: 'not-a-uuid',
          events: [{ sourceProvider: 'x' }],
        }),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'QOE_SESSION_INVALID',
    );

    await assert.rejects(
      () =>
        api.ingest.execute({
          anonymousSessionId: sessionId,
          events: [{ sourceProvider: 'x', timeToFirstFrameMs: -1 }],
        }),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'QOE_METRIC_INVALID',
    );
  });

  it('maps HTTP 202 and rejects unauthenticated or unknown fields', async () => {
    const api = buildApi();
    const routes = createDiagnosticsRoutes({ ingestQoeEvents: api.ingest });
    const route = routes.find(
      (entry) =>
        entry.method === 'POST' && entry.path === '/api/v1/diagnostics/qoe',
    );
    assert.ok(route);

    const unauthorized = await route.handler({
      method: 'POST',
      url: '/api/v1/diagnostics/qoe',
      headers: {},
      body: {
        anonymousSessionId: sessionId,
        events: [{ sourceProvider: 'acme' }],
      },
    });
    assert.equal(unauthorized.statusCode, 401);

    const ok = await route.handler({
      method: 'POST',
      url: '/api/v1/diagnostics/qoe',
      headers: {},
      accountId: randomUUID(),
      body: {
        anonymousSessionId: sessionId,
        appVersion: '2.0.0',
        deviceModel: 'Pixel',
        events: [
          {
            sourceProvider: 'acme',
            timeToFirstFrameMs: 100,
            rebufferEventsCount: 0,
            rebufferDurationMs: 0,
            streamErrorsCount: 1,
          },
        ],
      },
    });
    assert.equal(ok.statusCode, 202);
    assert.deepEqual(ok.body, { accepted: 1 });

    const badField = await route.handler({
      method: 'POST',
      url: '/api/v1/diagnostics/qoe',
      headers: {},
      accountId: randomUUID(),
      body: {
        anonymousSessionId: sessionId,
        accountId: 'must-not-appear',
        events: [{ sourceProvider: 'acme' }],
      },
    });
    assert.equal(badField.statusCode, 400);

    const optOut = await route.handler({
      method: 'POST',
      url: '/api/v1/diagnostics/qoe',
      headers: {},
      accountId: randomUUID(),
      body: {
        anonymousSessionId: sessionId,
        telemetryOptIn: false,
        events: [{ sourceProvider: 'acme' }],
      },
    });
    assert.equal(optOut.statusCode, 202);
    assert.deepEqual(optOut.body, { accepted: 0, skippedOptOut: true });
  });

  it('is registered in route catalog and MVP inventory', () => {
    assert.ok(
      ROUTE_CATALOG.some(
        (entry) =>
          entry.method === 'POST' &&
          entry.path === '/api/v1/diagnostics/qoe' &&
          entry.operationId === 'ingestQoeEvents',
      ),
    );
    const inv = MVP_V1_OPERATIONS.find(
      (entry) => entry.operationId === 'ingestQoeEvents',
    );
    assert.equal(inv?.implemented, true);
  });
});
