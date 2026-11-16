import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MVP_V1_OPERATIONS } from '../../openapi/mvp-v1-inventory.js';
import { ROUTE_CATALOG } from '../../src/presentation/http/route-catalog.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('BE-003 OpenAPI MVP v1 freeze', () => {
  const doc = JSON.parse(
    readFileSync(join(root, 'openapi/openapi.json'), 'utf8'),
  ) as {
    info: { version: string };
    paths: Record<string, Record<string, unknown>>;
  };

  it('freezes info.version at 1.0.0', () => {
    assert.equal(doc.info.version, '1.0.0');
  });

  it('includes every MVP inventory operation in OpenAPI', () => {
    for (const op of MVP_V1_OPERATIONS) {
      const methods = doc.paths[op.path];
      assert.ok(methods, `missing path ${op.path}`);
      const operation = methods[op.method.toLowerCase()] as
        | { operationId?: string }
        | undefined;
      assert.ok(operation, `missing ${op.method} ${op.path}`);
      assert.equal(operation.operationId, op.operationId);
    }
  });

  it('keeps implemented catalog routes marked implemented in inventory', () => {
    const byKey = new Map(
      MVP_V1_OPERATIONS.map((op) => [
        `${op.method.toUpperCase()} ${op.path}`,
        op,
      ]),
    );
    for (const entry of ROUTE_CATALOG) {
      const key = `${entry.method.toUpperCase()} ${entry.path}`;
      const inv = byKey.get(key);
      assert.ok(inv, `catalog ${key} not in MVP inventory`);
      assert.equal(inv.implemented, true, `${key} should be implemented: true`);
      assert.equal(inv.operationId, entry.operationId);
    }
  });

  it('omits EPG from the MVP freeze', () => {
    assert.equal(doc.paths['/api/v1/epg'], undefined);
    assert.equal(doc.paths['/epg'], undefined);
  });

  it('documents realtime as WSS upgrade at /realtime', () => {
    const rt = doc.paths['/realtime']?.get as { operationId?: string };
    assert.equal(rt?.operationId, 'realtimeHandshake');
  });
});
