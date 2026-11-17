/**
 * OpenAPI implementation contract tests (BE-122).
 *
 *   npm run openapi:implementation-contract
 *
 * Fails when route catalog / route modules / inventory drift from the frozen
 * OpenAPI document. Complements mock-backed `openapi:contract-test` (INF-045).
 */
import { isDirectRun } from './openapi/is-direct-run.js';
import { assertOpenApiImplementationContract } from './openapi/assert-implementation-contract.js';

export function runOpenApiImplementationContract(): {
  readonly ok: boolean;
  readonly errors: readonly string[];
} {
  const result = assertOpenApiImplementationContract();
  if (!result.ok) {
    console.error('OpenAPI implementation contract failed:');
    for (const error of result.errors) {
      console.error(`  - ${error}`);
    }
    return result;
  }

  console.log(
    `OpenAPI implementation contract passed (${result.errors.length} issues).`,
  );
  return result;
}

if (isDirectRun(import.meta.url)) {
  const result = runOpenApiImplementationContract();
  if (!result.ok) {
    process.exitCode = 1;
  }
}
