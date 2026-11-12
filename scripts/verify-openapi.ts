import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTE_CATALOG } from '../src/presentation/http/route-catalog.js';

type OpenApiDocument = {
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

  const missingInOpenApi = [...catalogOps].filter(
    (key) => !openApiOps.has(key),
  );
  const missingInCatalog = [...openApiOps].filter(
    (key) => !catalogOps.has(key),
  );

  if (missingInOpenApi.length === 0 && missingInCatalog.length === 0) {
    console.log(
      `OpenAPI verification passed (${catalogOps.size} operation(s) aligned).`,
    );
    return;
  }

  if (missingInOpenApi.length > 0) {
    console.error('Routes in catalog missing from OpenAPI:');
    for (const key of missingInOpenApi) console.error(`  - ${key}`);
  }
  if (missingInCatalog.length > 0) {
    console.error('OpenAPI operations missing from route catalog:');
    for (const key of missingInCatalog) console.error(`  - ${key}`);
  }
  process.exitCode = 1;
}

main();
