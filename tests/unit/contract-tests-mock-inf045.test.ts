import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runOpenApiContractTests } from '../../scripts/run-openapi-contract-tests.js';
import { createContractStackListener } from '../../scripts/serve-contract-stack.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('INF-045 contract tests and mock hosting', () => {
  it('defines CI contract-test stage in PR validation and api-mock workflows', () => {
    const pr = read('.github/workflows/pr-validation.yml');
    const apiMock = read('.github/workflows/api-mock.yml');
    const design = read('docs/infra/045-contract-tests-mock.md');
    assert.match(pr, /openapi:contract-test/);
    assert.match(pr, /name:\s*OpenAPI contract tests/);
    assert.match(apiMock, /openapi:contract-test/);
    assert.match(apiMock, /Dockerfile\.api-mock/);
    assert.match(design, /contract tests/i);
    assert.match(design, /mock/i);
  });

  it('packages a dedicated mock/docs Docker image', () => {
    const dockerfile = read('Dockerfile.api-mock');
    assert.match(dockerfile, /serve-contract-stack/);
    assert.match(dockerfile, /EXPOSE 8080/);
    assert.match(dockerfile, /docs\/api/);
    assert.match(dockerfile, /openapi/);
  });

  it('runs OpenAPI contract tests against the mock for all MVP operations', async () => {
    const summary = await runOpenApiContractTests();
    assert.equal(
      summary.failed.length,
      0,
      JSON.stringify(summary.failed, null, 2),
    );
    assert.ok(summary.passed >= 48);
  });

  it('serves docs and mock from the combined contract stack', async () => {
    const server = createServer(createContractStackListener());
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}`;

    const docs = await fetch(`${base}/docs`);
    assert.equal(docs.status, 200);
    assert.match(await docs.text(), /swagger-ui/i);

    const spec = await fetch(`${base}/openapi.json`);
    assert.equal(spec.status, 200);
    const json = (await spec.json()) as { info?: { version?: string } };
    assert.equal(json.info?.version, '1.0.0');

    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });
});
