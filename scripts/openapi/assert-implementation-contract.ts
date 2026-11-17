import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MVP_V1_OPERATIONS } from '../../openapi/mvp-v1-inventory.js';
import { ROUTE_CATALOG } from '../../src/presentation/http/route-catalog.js';
import { listOpenApiOperations } from './list-operations.js';
import { loadOpenApiDocument, repoRoot } from './load-openapi.js';
import { verifyOpenApiFreeze } from './verify-freeze.js';

export type ImplementationContractResult = {
  readonly ok: boolean;
  readonly errors: readonly string[];
};

type OpenApiOp = {
  readonly responses?: Readonly<
    Record<
      string,
      | {
          readonly content?: Readonly<Record<string, unknown>>;
        }
      | undefined
    >
  >;
  readonly operationId?: string;
};

/**
 * BE-122: fail when implementation (route catalog + route modules) drifts
 * from the frozen OpenAPI contract.
 */
export function assertOpenApiImplementationContract(): ImplementationContractResult {
  const errors: string[] = [];

  const freeze = verifyOpenApiFreeze();
  if (!freeze.ok) {
    errors.push(...freeze.errors);
  }

  const doc = loadOpenApiDocument();
  const listed = listOpenApiOperations(doc);
  const byKey = new Map(
    listed.map((op) => [`${op.method.toUpperCase()} ${op.path}`, op]),
  );
  const inventoryByKey = new Map(
    MVP_V1_OPERATIONS.map((op) => [
      `${op.method.toUpperCase()} ${op.path}`,
      op,
    ]),
  );

  for (const entry of ROUTE_CATALOG) {
    const key = `${entry.method.toUpperCase()} ${entry.path}`;
    const inv = inventoryByKey.get(key);
    if (!inv) {
      errors.push(`Catalog ${key} missing from MVP inventory`);
      continue;
    }
    if (!inv.implemented) {
      errors.push(
        `Catalog ${key} is registered but inventory marks implemented: false`,
      );
    }
    if (inv.operationId !== entry.operationId) {
      errors.push(
        `operationId mismatch for ${key}: catalog=${entry.operationId} inventory=${inv.operationId}`,
      );
    }

    const openApi = byKey.get(key);
    if (!openApi) {
      errors.push(`Catalog ${key} missing from OpenAPI paths`);
      continue;
    }
    if (openApi.operationId !== entry.operationId) {
      errors.push(
        `operationId mismatch for ${key}: catalog=${entry.operationId} openapi=${openApi.operationId}`,
      );
    }

    if (entry.path === '/realtime') {
      // WSS upgrade — no JSON success body required.
      continue;
    }

    const successIssue = assertSuccessResponse(openApi.operation, key);
    if (successIssue !== null) {
      errors.push(successIssue);
    }
  }

  const pathLiterals = collectRoutePathLiterals();
  for (const entry of ROUTE_CATALOG) {
    if (entry.path === '/realtime') {
      continue;
    }
    if (!pathLiterals.has(entry.path)) {
      errors.push(
        `Catalog path ${entry.path} not found in presentation route modules (implementation drift)`,
      );
    }
  }

  for (const path of pathLiterals) {
    const inCatalog = ROUTE_CATALOG.some((entry) => entry.path === path);
    if (!inCatalog) {
      errors.push(
        `Route module path ${path} missing from ROUTE_CATALOG (implementation drift)`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}

function assertSuccessResponse(
  operation: OpenApiOp,
  key: string,
): string | null {
  const responses = operation.responses ?? {};
  const successCodes = Object.keys(responses).filter((code) =>
    /^2\d\d$/.test(code),
  );
  if (successCodes.length === 0) {
    return `OpenAPI ${key} has no 2xx response`;
  }

  for (const code of successCodes) {
    if (code === '204') {
      continue;
    }
    const response = responses[code];
    if (!response?.content || Object.keys(response.content).length === 0) {
      return `OpenAPI ${key} ${code} response missing content schema`;
    }
  }
  return null;
}

function collectRoutePathLiterals(): Set<string> {
  const routesDir = join(repoRoot(), 'src', 'presentation', 'http', 'routes');
  const paths = new Set<string>();
  const pathPattern = /path:\s*'(\/[^']+)'/g;

  for (const name of readdirSync(routesDir)) {
    if (!name.endsWith('.ts')) {
      continue;
    }
    const source = readFileSync(join(routesDir, name), 'utf8');
    for (const match of source.matchAll(pathPattern)) {
      const path = match[1];
      if (path !== undefined) {
        paths.add(path);
      }
    }
  }
  return paths;
}
