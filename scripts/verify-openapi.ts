import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MVP_V1_OPERATIONS } from '../openapi/mvp-v1-inventory.js';
import { ROUTE_CATALOG } from '../src/presentation/http/route-catalog.js';

type OpenApiDocument = {
  readonly info?: { readonly version?: string };
  readonly paths?: Readonly<
    Record<string, Readonly<Record<string, unknown>> | undefined>
  >;
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const openApiPath = join(root, 'openapi', 'openapi.json');

function operationKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

function loadOpenApiOperations(doc: OpenApiDocument): Set<string> {
  const keys = new Set<string>();
  const httpMethods = new Set([
    'get',
    'post',
    'put',
    'patch',
    'delete',
    'head',
    'options',
  ]);

  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    if (!item) continue;
    for (const method of Object.keys(item)) {
      if (!httpMethods.has(method.toLowerCase())) continue;
      keys.add(operationKey(method, path));
    }
  }
  return keys;
}

function main(): void {
  const raw = readFileSync(openApiPath, 'utf8');
  const doc = JSON.parse(raw) as OpenApiDocument;
  const openApiOps = loadOpenApiOperations(doc);
  const catalogOps = new Set(
    ROUTE_CATALOG.map((entry) => operationKey(entry.method, entry.path)),
  );
  const mvpOps = new Set(
    MVP_V1_OPERATIONS.map((entry) => operationKey(entry.method, entry.path)),
  );

  const missingInOpenApi = [...catalogOps].filter(
    (key) => !openApiOps.has(key),
  );
  const catalogNotInMvp = [...catalogOps].filter((key) => !mvpOps.has(key));
  const mvpMissingInOpenApi = [...mvpOps].filter((key) => !openApiOps.has(key));
  const openApiOutsideMvp = [...openApiOps].filter((key) => !mvpOps.has(key));

  const version = doc.info?.version;
  const versionOk = version === '1.0.0';

  let failed = false;

  if (!versionOk) {
    failed = true;
    console.error(
      `OpenAPI info.version must be frozen at 1.0.0 (found ${String(version)}).`,
    );
  }

  if (missingInOpenApi.length > 0) {
    failed = true;
    console.error('Routes in catalog missing from OpenAPI:');
    for (const key of missingInOpenApi) console.error(`  - ${key}`);
  }

  if (catalogNotInMvp.length > 0) {
    failed = true;
    console.error('Implemented catalog routes missing from MVP v1 inventory:');
    for (const key of catalogNotInMvp) console.error(`  - ${key}`);
  }

  if (mvpMissingInOpenApi.length > 0) {
    failed = true;
    console.error('MVP v1 inventory operations missing from OpenAPI:');
    for (const key of mvpMissingInOpenApi) console.error(`  - ${key}`);
  }

  if (openApiOutsideMvp.length > 0) {
    failed = true;
    console.error(
      'OpenAPI operations outside MVP v1 freeze (remove or extend inventory):',
    );
    for (const key of openApiOutsideMvp) console.error(`  - ${key}`);
  }

  if (failed) {
    process.exitCode = 1;
    return;
  }

  const pending = MVP_V1_OPERATIONS.filter((op) => !op.implemented).length;
  console.log(
    `OpenAPI MVP v1 freeze verified (${mvpOps.size} operations; ${catalogOps.size} implemented; ${pending} contract-only; version ${version}).`,
  );
}

main();
