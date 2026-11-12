import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GetHealthStatus } from '../../src/application/health/get-health-status.js';
import { ROUTE_CATALOG } from '../../src/presentation/http/route-catalog.js';
import { createHealthRoute } from '../../src/presentation/http/routes/health-route.js';

describe('ROUTE_CATALOG', () => {
  it('includes the registered health route', () => {
    const health = createHealthRoute(new GetHealthStatus());
    const entry = ROUTE_CATALOG.find(
      (route) => route.method === health.method && route.path === health.path,
    );
    assert.ok(entry, 'health route must be listed in ROUTE_CATALOG');
    assert.equal(entry.operationId, 'getHealth');
  });
});
