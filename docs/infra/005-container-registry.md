# INF-005: Container registry and image baseline

- **Status:** Accepted (Sprint 0 **mock** Terraform — no live apply)
- **Refs:** Infra §2.2; ADR-001; INF-001; INF-010; INF-044
- **Task:** INF-005
- **Mock date:** 2026-11-11

## Goal

Provide an **Amazon ECR** repository per environment, freeze the **multi-stage / non-root** backend image baseline, and require **vulnerability scanning before (and on) image push**.

## Design

| Concern | Choice |
| --- | --- |
| Registry | **Amazon ECR** private repo `mi-iptv-{env}-api` |
| Image | Root `Dockerfile` — multi-stage Node 22, runtime **UID 10001** |
| Scan on push | GitHub Actions: build → **Trivy** (HIGH/CRITICAL) → push to ECR |
| Scan on PR | INF-044 already builds + Trivy-scans (no push) |
| Tags | `sha-<gitsha>` + `env` floating tag (`dev` / `qa` / `prod`) |

### Image baseline rules

1. **Multi-stage** — toolchain only in `build`; runtime copies `dist/` + production `node_modules`.
2. **Non-root** — `USER app` (uid/gid **10001**); no root process in the final stage.
3. **No secrets in image** — never `COPY .env`; inject `DATABASE_URL` / secrets at runtime (INF-013).
4. **HEALTHCHECK** — `GET /health` via Node (no curl package required).
5. **Scan gate** — Trivy must pass before `docker push` / ECR put-image in the publish workflow.

### ECR module settings (mock)

| Setting | Value |
| --- | --- |
| Image tag mutability | `MUTABLE` (allow retagging `dev`/`qa`/`prod`) |
| Scan on push (AWS) | **Enabled** (`scan_on_push = true`) — native ECR basic scan as defense in depth |
| Encryption | AES256 (SSE-S3); KMS optional later |
| Lifecycle | Keep last **20** tagged images; expire untagged after **7** days |

### Workflow

`.github/workflows/container-image.yml`

1. Trigger: `push` to `main` / `develop`, `workflow_dispatch`.
2. Build `mi-iptv-backend` from `Dockerfile`.
3. Trivy image scan (`HIGH,CRITICAL`, fail closed).
4. If `ECR_REGISTRY` + AWS OIDC role are configured: login, tag, **push**.
5. If registry vars are absent (Sprint 0 mock): scan still runs; push step is skipped with a clear notice.

Full app packaging (APK/IPA) is **INF-041** (`docs/infra/041-build-package-workflows.md`); Docker packaging is reused via `workflow_call`. Deploy pipelines that consume the image remain **INF-042**.

## Module

`infra/terraform/modules/ecr` — wired from `environments/{dev,qa,prod}`.

## Verification checklist (DoD) — mock complete

- [x] Multi-stage Docker builds (`Dockerfile` build + runtime stages)
- [x] Non-root images (`USER app` / uid 10001)
- [x] Scanning on push (Trivy gate in publish workflow + ECR `scan_on_push`)

## Live cutover

1. Apply ECR module in each account.
2. Grant CI OIDC role push to the env repo ARN (tighten `ci_oidc` resources from `*`).
3. Set GitHub environment vars/secrets for `ECR_REGISTRY` / role ARN; enable push step.
