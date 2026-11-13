# INF-040: Pull-request validation

- **Status:** Accepted (Sprint 0)
- **Refs:** Infra §3.1; BE-002
- **Task:** INF-040
- **Date:** 2026-11-11

## Goal

Run **lint**, **format**, **unit tests**, and **OpenAPI-vs-code** checks on every pull request so regressions fail before merge.

## Design

| Check | Command / job | Scope |
| --- | --- | --- |
| Format | `npm run format:check` | Backend TypeScript / config |
| Lint | `npm run lint` | Backend ESLint |
| Typecheck | `npm run typecheck` | Backend `tsc --noEmit` |
| Unit tests | `npm test` | Backend `tests/unit` |
| OpenAPI vs code | `npm run openapi:verify` | `openapi/openapi.json` ↔ `route-catalog` |
| Apps | workflow job `apps` | Skips when `apps/` absent (TV/companion live in other repos; packaging = INF-041) |
| DB migrations + seeds | workflow job `migrations` | Postgres 16 service; `db:migrate` then DEV/QA `db:seed` (BE-007) |

### Workflow

`.github/workflows/pr-validation.yml` triggers on:

- `pull_request` to `main`, `develop`, `release/**`
- `workflow_dispatch` (manual)

Node **22** (matches `package.json` engines). No AWS credentials required for PR validation.

### OpenAPI contract

| Artifact | Role |
| --- | --- |
| `openapi/openapi.json` | Canonical HTTP contract (OpenAPI 3.1) |
| `src/presentation/http/route-catalog.ts` | Paths/methods registered by the presentation layer |
| `scripts/verify-openapi.ts` | Fails if catalog and OpenAPI diverge (no extra npm packages; uses existing `tsx`) |

Current surface: `GET /health` (Infra §2.2 health check). Expand both files together when adding `/api/v1` routes.

### Apps note

Infra §3.1 mentions frontend unit tests. This repository is the **backend** modular monolith. The `apps` job records that TV/companion suites are out of tree until an `apps/` workspace (or separate repo workflows) exists. Packaging of APK/IPA is **INF-041** (`docs/infra/041-build-package-workflows.md`).

## Verification checklist (DoD)

- [x] Lint on PR
- [x] Format on PR
- [x] Unit tests for backend on PR
- [x] Apps job present (skip/pass with message when no `apps/` tree)
- [x] OpenAPI-vs-code verification on PR

## Local

```bash
npm run ci
```
