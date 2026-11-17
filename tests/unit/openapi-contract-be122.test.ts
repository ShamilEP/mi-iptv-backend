import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runOpenApiContractTests } from '../../scripts/run-openapi-contract-tests.js';
import { runOpenApiImplementationContract } from '../../scripts/run-openapi-implementation-contract.js';
import { runOpenApiVerify } from '../../scripts/verify-openapi.js';
import { ROUTE_CATALOG } from '../../src/presentation/http/route-catalog.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('OpenAPI contract tests (BE-122)', () => {
  it('fails CI wiring includes verify + mock + implementation contract', () => {
    const pr = read('.github/workflows/pr-validation.yml');
    const apiMock = read('.github/workflows/api-mock.yml');
    const pkg = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>;
    };

    assert.match(pr, /openapi:verify/);
    assert.match(pr, /openapi:contract-test/);
    assert.match(pr, /openapi:implementation-contract/);
    assert.match(apiMock, /openapi:verify/);
    assert.match(apiMock, /openapi:contract-test/);
    assert.match(apiMock, /openapi:implementation-contract/);

    const ciScript = pkg.scripts.ci ?? '';
    assert.match(ciScript, /openapi:verify/);
    assert.match(ciScript, /openapi:contract-test/);
    assert.match(ciScript, /openapi:implementation-contract/);
    assert.equal(
      pkg.scripts['openapi:implementation-contract'],
      'tsx scripts/run-openapi-implementation-contract.ts',
    );
  });

  it('verifies the frozen OpenAPI ↔ catalog ↔ inventory contract', () => {
    const result = runOpenApiVerify();
    assert.equal(result.ok, true, result.errors.join('\n'));
  });

  it('detects implementation drift against the frozen contract', () => {
    const result = runOpenApiImplementationContract();
    assert.equal(result.ok, true, result.errors.join('\n'));
    assert.ok(ROUTE_CATALOG.length >= 40);
  });

  it('keeps mock contract tests green for every MVP operation', async () => {
    const summary = await runOpenApiContractTests();
    assert.equal(
      summary.failed.length,
      0,
      JSON.stringify(summary.failed, null, 2),
    );
    assert.ok(summary.passed >= 48);
  });
});
