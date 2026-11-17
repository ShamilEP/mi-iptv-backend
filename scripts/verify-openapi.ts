/**
 * OpenAPI freeze verifier (BE-003 / BE-122).
 *
 *   npm run openapi:verify
 */
import { isDirectRun } from './openapi/is-direct-run.js';
import { verifyOpenApiFreeze } from './openapi/verify-freeze.js';

export function runOpenApiVerify(): {
  readonly ok: boolean;
  readonly errors: readonly string[];
} {
  const result = verifyOpenApiFreeze();
  if (!result.ok) {
    for (const error of result.errors) {
      console.error(error);
    }
    return { ok: false, errors: result.errors };
  }

  console.log(
    `OpenAPI MVP v1 freeze verified (${result.operationCount} operations; ${result.implementedCount} implemented; ${result.contractOnlyCount} contract-only; version ${result.version}).`,
  );
  return { ok: true, errors: [] };
}

if (isDirectRun(import.meta.url)) {
  const result = runOpenApiVerify();
  if (!result.ok) {
    process.exitCode = 1;
  }
}
