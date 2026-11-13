# INF-044: Security scans in the pipeline

- **Status:** Accepted (Sprint 0)
- **Refs:** Infra §3.1; INF-040
- **Task:** INF-044
- **Date:** 2026-11-11

## Goal

Add **secret scanning**, **dependency scanning**, **container image scanning**, and **SAST** to CI so insecure changes fail before merge/deploy.

## Design

Workflow: `.github/workflows/security-scans.yml`

| Scan | Tool | How |
| --- | --- | --- |
| Secrets | **Gitleaks** | `ghcr.io/gitleaks/gitleaks` Docker detect (`fetch-depth: 0`; no Action license) |
| Dependencies | **`npm audit`** | `--audit-level=high` after `npm ci` (no new npm packages) |
| Image | **Trivy** | `docker build` then scan local image `mi-iptv-backend:scan` |
| SAST | **CodeQL** | `javascript-typescript` analyze; uploads SARIF when GitHub supports it |

Triggers (aligned with INF-040):

- `pull_request` → `main`, `develop`, `release/**`
- `push` → `main`, `develop`
- `workflow_dispatch`

No AWS credentials and **no new application npm dependencies**. Marketplace Actions run scanners as CI tools only (not imported into domain/application).

### Severity / failure policy (Sprint 0)

| Scan | Fails the job when |
| --- | --- |
| Gitleaks | Any secret finding |
| npm audit | High or critical advisories |
| Trivy image | High or critical OS/lib vulns (`severity: HIGH,CRITICAL`, `exit-code: 1`) |
| CodeQL | Analysis errors, or findings that GitHub marks as failing the check |

Moderate npm advisories (e.g. current `minimatch` via ESLint toolchain) are reported by `npm audit` locally but do not fail CI until `--audit-level=high` is crossed. Track upgrades separately (prefer non-breaking bumps).

**Patch SLAs and dependency/image vulnerability ownership:** **SEC-004** (`docs/security/004-dependency-image-vulnerability-policy.md`).

### Local commands

```bash
npm run security:deps
# Optional local image scan (requires Docker + Trivy):
# docker build -t mi-iptv-backend:scan .
# trivy image --severity HIGH,CRITICAL --exit-code 1 mi-iptv-backend:scan
```

### Config

| File | Purpose |
| --- | --- |
| `.gitleaks.toml` | Allow known safe paths (e.g. `.env.example` placeholder names only) |
| `.github/codeql/codeql-config.yml` | CodeQL paths / query suite |

## Verification checklist (DoD)

- [x] Secret scanning in pipeline (Gitleaks)
- [x] Dependency scanning in pipeline (`npm audit`)
- [x] Image scanning in pipeline (Docker build + Trivy)
- [x] SAST in pipeline (CodeQL)

## Follow-ups

- Dependabot config lives in `.github/dependabot.yml` (SEC-004); enable alerts in org settings if needed.
- Tighten Trivy / CodeQL gates after baseline noise is cleared.
- INF-005 image baseline / registry push can reuse the same Trivy step before push.
