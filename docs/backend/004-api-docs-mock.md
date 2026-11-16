# BE-004: API docs, mock server, and client stubs

- **Status:** Implemented (Sprint 0)
- **Refs:** SRS §8, §22; BE-003 OpenAPI MVP v1.0.0; BE-004
- **Contract:** `openapi/openapi.json`

## Goal

Publish interactive API docs and a contract-driven mock so TV, companion, and QA can build in parallel before every endpoint is implemented.

## Commands

| Script | Default URL | Purpose |
| --- | --- | --- |
| `npm run docs:api` | http://localhost:4010/docs | Swagger UI over the frozen OpenAPI |
| `npm run mock:api` | http://localhost:4011 | Mock HTTP responses from schemas/examples |
| `npm run contract:serve` | http://localhost:8080/docs | Combined docs + mock (INF-045 hosting) |
| `npm run openapi:contract-test` | (CI) | Exercise all MVP ops against the mock |
| `npm run openapi:generate-clients` | `generated/clients/typescript/` | TypeScript fetch client stubs |

Ports: `API_DOCS_PORT` (default `4010`), `API_MOCK_PORT` (default `4011`).

## Design

- **Swagger UI** is served as static HTML (`docs/api/index.html`) that loads Swagger UI 5.x from unpkg CDN and fetches `/openapi.json` from the docs server. No npm package required.
- **Mock server** is Node `http` only. It matches OpenAPI path templates, picks the first 2xx response, and builds a JSON body from `example` / `examples` / schema defaults. WSS `/realtime` returns a JSON capability note (no upgrade).
- **Client stubs** are generated TypeScript types + `MiIptvApiClient` fetch wrappers keyed by `operationId`. Commit the generated tree so consumers do not need to regenerate locally.

## Optional packages (not installed)

See `docs/dev/proposed-packages-BE-004.md` for Prism / swagger-ui-dist / openapi-typescript if we later want offline UI assets or richer mocks.

## Validation

```bash
npm run openapi:generate-clients
npm run openapi:verify
npm test
```
