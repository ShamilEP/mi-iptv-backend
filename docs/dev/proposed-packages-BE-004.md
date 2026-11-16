# Proposed packages for BE-004 (API docs / mock / stubs)

**Status:** Not installed — BE-004 ships with Node built-ins + CDN Swagger UI.

Approve any row below only if we want to replace the built-in tooling.

| Package | Purpose | Alternatives | Rationale |
| --- | --- | --- | --- |
| `swagger-ui-dist` | Offline vendored Swagger UI assets | Keep CDN `unpkg` (current) | Removes CDN dependency for air-gapped/dev docs |
| `@stoplight/prism-cli` | Spec-accurate mock + validation | Keep `scripts/mock-api-server.ts` (current) | Stronger request validation / dynamic examples |
| `openapi-typescript` | Richer TS types from OpenAPI | Keep `scripts/generate-client-stubs.ts` (current) | Less custom schema→TS code to maintain |

## Wiring rule

- Install only after explicit human approval.
- Keep generators/adapters under `scripts/` or `src/infrastructure` — never import vendor SDKs from `domain` / `application`.
