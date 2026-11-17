# INF-045: Contract-test stage and mock server deployment

- **Status:** Accepted (Sprint 0)
- **Refs:** SRS §8, §22; BE-004; INF-040
- **Task:** INF-045
- **Date:** 2026-11-16

## Goal

Run **OpenAPI contract tests in CI** and **host the mock/docs stack** so TV, companion, and QA can build against a stable contract without waiting for every backend endpoint.

## Design

| Piece | Artifact | Notes |
| --- | --- | --- |
| Contract tests | `npm run openapi:contract-test` | Hits every MVP operation on the BE-004 mock; asserts 2xx + JSON object bodies |
| Verify | `npm run openapi:verify` | Inventory ↔ OpenAPI ↔ route catalog (INF-040) |
| Implementation contract | `npm run openapi:implementation-contract` | Implementation drift vs freeze (BE-122) |
| Combined host | `npm run contract:serve` / `Dockerfile.api-mock` | Swagger UI + mock on one port (`8080`) |
| CI workflow | `.github/workflows/api-mock.yml` | Contract tests, docs artifact, mock image smoke, optional ECR + Pages |
| PR gate | `.github/workflows/pr-validation.yml` job `contract` | Same contract tests on every PR |

### Hosting for client teams

| Channel | When | URL / artifact |
| --- | --- | --- |
| CI artifact `api-contract-docs` | Every PR / push | `openapi.json`, `docs/api/`, TS stubs |
| Docker image `mi-iptv-api-mock` | Built on PR/push; pushed to ECR when `AWS_ROLE_ARN` + `ECR_REGISTRY` set (non-PR) | Run: `docker run --rm -p 8080:8080 …` → `/docs`, `/openapi.json`, mock API |
| GitHub Pages | Opt-in via `ENABLE_API_DOCS_PAGES=true` | Swagger UI over published `openapi.json` |

Local:

```bash
npm run openapi:contract-test
npm run contract:serve   # http://localhost:8080/docs
```

### Secret / config names (no values in git)

| Name | Kind | Purpose |
| --- | --- | --- |
| `AWS_ROLE_ARN` | GitHub Actions variable | OIDC role for ECR push |
| `ECR_REGISTRY` | GitHub Actions variable | Registry host for mock image |
| `AWS_REGION` | GitHub Actions variable | Optional (default `us-east-1`) |
| `ENABLE_API_DOCS_PAGES` | GitHub Actions variable | Set `true` after enabling Pages |

## Verification checklist (DoD)

- [x] OpenAPI contract tests run in CI (`pr-validation` + `api-mock` workflows)
- [x] Mock/docs stack packaged (`Dockerfile.api-mock`) and smoked in CI
- [x] Client-facing publish path documented (artifact + optional ECR/Pages)

## Live cutover

1. Enable GitHub Pages (Actions source) and set `ENABLE_API_DOCS_PAGES=true`.
2. Configure OIDC + ECR vars to publish `mi-iptv-api-mock`.
3. Point TV/companion/QA base URLs at the hosted mock (or local `contract:serve`) until BE-006+ catches up.
