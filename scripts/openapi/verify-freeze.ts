import { readFileSync } from 'node:fs';
import { MVP_V1_OPERATIONS } from '../../openapi/mvp-v1-inventory.js';
import { ROUTE_CATALOG } from '../../src/presentation/http/route-catalog.js';
import { loadOpenApiDocument, openApiDocumentPath } from './load-openapi.js';

export type VerifyFreezeResult = {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly operationCount: number;
  readonly implementedCount: number;
  readonly contractOnlyCount: number;
  readonly version: string | undefined;
};

function operationKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

function loadOpenApiOperationKeys(
  doc: ReturnType<typeof loadOpenApiDocument>,
): Set<string> {
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

/**
 * BE-003 / BE-122: fail when inventory, OpenAPI, or route catalog diverge.
 */
export function verifyOpenApiFreeze(): VerifyFreezeResult {
  const errors: string[] = [];
  // Ensure the file still exists / is readable (same path CI uses).
  readFileSync(openApiDocumentPath(), 'utf8');
  const doc = loadOpenApiDocument();
  const openApiOps = loadOpenApiOperationKeys(doc);
  const catalogOps = new Set(
    ROUTE_CATALOG.map((entry) => operationKey(entry.method, entry.path)),
  );
  const mvpOps = new Set(
    MVP_V1_OPERATIONS.map((entry) => operationKey(entry.method, entry.path)),
  );

  const version = doc.info?.version;
  if (version !== '1.0.0') {
    errors.push(
      `OpenAPI info.version must be frozen at 1.0.0 (found ${String(version)}).`,
    );
  }

  for (const key of catalogOps) {
    if (!openApiOps.has(key)) {
      errors.push(`Route catalog entry missing from OpenAPI: ${key}`);
    }
    if (!mvpOps.has(key)) {
      errors.push(`Route catalog entry missing from MVP inventory: ${key}`);
    }
  }

  for (const key of mvpOps) {
    if (!openApiOps.has(key)) {
      errors.push(`MVP inventory operation missing from OpenAPI: ${key}`);
    }
  }

  for (const key of openApiOps) {
    if (!mvpOps.has(key)) {
      errors.push(`OpenAPI operation outside MVP freeze: ${key}`);
    }
  }

  const contractOnlyCount = MVP_V1_OPERATIONS.filter(
    (op) => !op.implemented,
  ).length;

  return {
    ok: errors.length === 0,
    errors,
    operationCount: mvpOps.size,
    implementedCount: catalogOps.size,
    contractOnlyCount,
    version,
  };
}
