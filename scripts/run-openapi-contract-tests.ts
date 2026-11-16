/**
 * OpenAPI contract tests against the in-process mock (INF-045 / BE-004).
 *
 *   npm run openapi:contract-test
 *
 * Starts an ephemeral server, exercises every MVP operation once, and asserts
 * a successful mock response (2xx) with JSON when a body is expected.
 */
import { createServer } from 'node:http';
import { isDirectRun } from './openapi/is-direct-run.js';
import { listOpenApiOperations } from './openapi/list-operations.js';
import { loadOpenApiDocument } from './openapi/load-openapi.js';
import { createOpenApiMockListener } from './mock-api-server.js';
import type { ListedOperation } from './openapi/list-operations.js';
import { MVP_V1_OPERATIONS } from '../openapi/mvp-v1-inventory.js';

const SAMPLE_UUID = '00000000-0000-4000-8000-000000000001';

export type ContractTestResult = {
  readonly operationId: string;
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly ok: boolean;
  readonly detail?: string;
};

export async function runOpenApiContractTests(): Promise<{
  readonly passed: number;
  readonly failed: readonly ContractTestResult[];
  readonly results: readonly ContractTestResult[];
}> {
  const doc = loadOpenApiDocument();
  const operations = listOpenApiOperations(doc);
  assertInventoryCoverage(operations);

  const server = createServer(createOpenApiMockListener(doc));
  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve());
    server.once('error', reject);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind ephemeral contract-test server');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const results: ContractTestResult[] = [];
  try {
    for (const op of operations) {
      results.push(await exerciseOperation(baseUrl, op));
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  const failed = results.filter((result) => !result.ok);
  return {
    passed: results.length - failed.length,
    failed,
    results,
  };
}

function assertInventoryCoverage(operations: readonly ListedOperation[]): void {
  const keys = new Set(
    operations.map((op) => `${op.method.toUpperCase()} ${op.path}`),
  );
  for (const entry of MVP_V1_OPERATIONS) {
    const key = `${entry.method.toUpperCase()} ${entry.path}`;
    if (!keys.has(key)) {
      throw new Error(`OpenAPI missing MVP inventory operation: ${key}`);
    }
  }
  if (operations.length !== MVP_V1_OPERATIONS.length) {
    throw new Error(
      `OpenAPI operation count ${operations.length} != inventory ${MVP_V1_OPERATIONS.length}`,
    );
  }
}

async function exerciseOperation(
  baseUrl: string,
  op: ListedOperation,
): Promise<ContractTestResult> {
  const path = materializePath(op.path);
  const init: RequestInit = {
    method: op.method.toUpperCase(),
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-account-id': SAMPLE_UUID,
      'x-profile-id': SAMPLE_UUID,
      'x-device-id': SAMPLE_UUID,
      'x-trace-id': 'contract-test-trace',
    },
  };
  if (['POST', 'PUT', 'PATCH'].includes(op.method.toUpperCase())) {
    init.body = '{}';
  }

  try {
    const response = await fetch(`${baseUrl}${path}`, init);
    const contentType = response.headers.get('content-type') ?? '';
    if (response.status >= 200 && response.status < 300) {
      if (response.status !== 204 && contentType.includes('application/json')) {
        const body: unknown = await response.json();
        if (body === null || typeof body !== 'object') {
          return {
            operationId: op.operationId,
            method: op.method,
            path: op.path,
            status: response.status,
            ok: false,
            detail: 'JSON body was not an object',
          };
        }
      }
      return {
        operationId: op.operationId,
        method: op.method,
        path: op.path,
        status: response.status,
        ok: true,
      };
    }
    return {
      operationId: op.operationId,
      method: op.method,
      path: op.path,
      status: response.status,
      ok: false,
      detail: `expected 2xx, got ${response.status}`,
    };
  } catch (error: unknown) {
    return {
      operationId: op.operationId,
      method: op.method,
      path: op.path,
      status: 0,
      ok: false,
      detail: error instanceof Error ? error.message : 'request failed',
    };
  }
}

function materializePath(template: string): string {
  return template.replace(/\{[^}]+\}/g, SAMPLE_UUID);
}

async function main(): Promise<void> {
  const summary = await runOpenApiContractTests();
  for (const result of summary.results) {
    const mark = result.ok ? 'PASS' : 'FAIL';
    const extra = result.detail ? ` — ${result.detail}` : '';
    console.log(
      `${mark} ${result.method.toUpperCase()} ${result.path} (${result.operationId}) [${result.status}]${extra}`,
    );
  }
  console.log(
    `OpenAPI contract tests: ${summary.passed}/${summary.results.length} passed`,
  );
  if (summary.failed.length > 0) {
    process.exitCode = 1;
  }
}

if (isDirectRun(import.meta.url)) {
  void main();
}
