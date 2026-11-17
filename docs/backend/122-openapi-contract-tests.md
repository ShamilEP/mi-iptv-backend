# BE-122: OpenAPI contract tests

- **Status:** Implemented (awaiting review)
- **Refs:** SRS §22; Infra §3.1; BE-003; INF-040; INF-045
- **Task:** BE-122

## Goal

**Fail CI when the implementation drifts from the frozen OpenAPI contract.**

## Gates (must all pass)

| Gate | Command | Detects |
| --- | --- | --- |
| Freeze verify | `npm run openapi:verify` | Catalog / inventory / `openapi.json` set or version drift |
| Mock contract | `npm run openapi:contract-test` | Frozen MVP ops not exercisable on BE-004 mock (INF-045) |
| Implementation contract | `npm run openapi:implementation-contract` | Catalog ↔ OpenAPI operationIds / 2xx schemas; route module paths ↔ `ROUTE_CATALOG` |

## CI

- `.github/workflows/pr-validation.yml` — `backend` + `contract` jobs
- `.github/workflows/api-mock.yml` — `contract-tests` job
- Local: `npm run ci` runs all three OpenAPI scripts

## Relationship to INF-045

INF-045 hosts the **mock** contract suite for TV/companion/QA. BE-122 adds the
**implementation** drift gate so shipping `src/presentation` routes cannot leave
the frozen contract without failing CI.

## Out of scope

- Full JSON Schema validation of live gateway response bodies (optional later; propose `ajv` only if required)
- Contract-only inventory ops that are not yet in `ROUTE_CATALOG`
