import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { MVP_V1_OPERATIONS } from '../../openapi/mvp-v1-inventory.js';
import { createOpenApiMockListener } from '../../scripts/mock-api-server.js';
import { listOpenApiOperations } from '../../scripts/openapi/list-operations.js';
import {
  loadOpenApiDocument,
  repoRoot,
} from '../../scripts/openapi/load-openapi.js';
import { matchOpenApiPath } from '../../scripts/openapi/match-path.js';
import { pickSuccessMockResponse } from '../../scripts/openapi/pick-success-response.js';
import { buildSchemaExample } from '../../scripts/openapi/schema-example.js';

describe('BE-004 OpenAPI docs / mock / stubs', () => {
  const doc = loadOpenApiDocument();

  it('lists every frozen MVP operation', () => {
    const listed = listOpenApiOperations(doc);
    assert.equal(listed.length, MVP_V1_OPERATIONS.length);
    const keys = new Set(
      listed.map((op) => `${op.method.toUpperCase()} ${op.path}`),
    );
    for (const entry of MVP_V1_OPERATIONS) {
      assert.ok(
        keys.has(`${entry.method.toUpperCase()} ${entry.path}`),
        `missing ${entry.method} ${entry.path}`,
      );
    }
  });

  it('matches OpenAPI path templates', () => {
    const match = matchOpenApiPath(
      '/api/v1/sources/{id}',
      '/api/v1/sources/abc-123',
    );
    assert.deepEqual(match?.params, { id: 'abc-123' });
    assert.equal(
      matchOpenApiPath('/api/v1/sources/{id}', '/api/v1/sources'),
      null,
    );
  });

  it('builds schema examples for component refs', () => {
    const health = doc.paths?.['/health']?.get;
    assert.ok(health);
    const mock = pickSuccessMockResponse(doc, health);
    assert.equal(mock.status, 200);
    assert.deepEqual(mock.body, { status: 'ok' });
  });

  it('builds nested object examples from schemas', () => {
    const loginSchema = doc.components?.schemas?.LoginResponse;
    assert.ok(loginSchema);
    const example = buildSchemaExample(doc, loginSchema);
    assert.equal(typeof example, 'object');
    assert.ok(example && typeof example === 'object');
    assert.ok('accessToken' in example);
  });

  it('serves docs HTML and openapi.json', async () => {
    const openApiJson = readFileSync(
      join(repoRoot(), 'openapi', 'openapi.json'),
    );
    const docsHtml = readFileSync(join(repoRoot(), 'docs', 'api', 'index.html'));
    const server = createServer((req, res) => {
      const path = req.url ?? '/';
      if (path === '/docs') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(docsHtml);
        return;
      }
      if (path === '/openapi.json') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(openApiJson);
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}`;

    const docsRes = await fetch(`${base}/docs`);
    assert.equal(docsRes.status, 200);
    const html = await docsRes.text();
    assert.match(html, /swagger-ui/i);
    assert.match(html, /\/openapi\.json/);

    const specRes = await fetch(`${base}/openapi.json`);
    assert.equal(specRes.status, 200);
    const spec = (await specRes.json()) as { info?: { version?: string } };
    assert.equal(spec.info?.version, '1.0.0');

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('generates TypeScript client stubs for all operations', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        join(repoRoot(), 'scripts', 'generate-client-stubs.ts'),
      ],
      {
        cwd: repoRoot(),
        encoding: 'utf8',
        env: process.env,
      },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const client = readFileSync(
      join(repoRoot(), 'generated', 'clients', 'typescript', 'client.ts'),
      'utf8',
    );
    const types = readFileSync(
      join(repoRoot(), 'generated', 'clients', 'typescript', 'types.ts'),
      'utf8',
    );
    assert.match(client, /export class MiIptvApiClient/);
    assert.match(types, /export type LoginResponse/);
    assert.match(client, /searchCatalog\(query:/);
    assert.match(client, /"q": string/);
    assert.match(client, /buildPath\(/);
    for (const entry of MVP_V1_OPERATIONS) {
      const fn =
        entry.operationId.charAt(0).toLowerCase() + entry.operationId.slice(1);
      assert.match(client, new RegExp(`\\b${fn}\\(`), `missing stub ${fn}`);
    }
  });

  it('mock listener returns schema examples for matched routes', async () => {
    const server = createServer(createOpenApiMockListener(doc));
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}`;

    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const missing = await fetch(`${base}/nope`);
    assert.equal(missing.status, 404);

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });
});
