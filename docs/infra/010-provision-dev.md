# INF-010: Provision DEV

- **Status:** Accepted (Sprint 0 **mock** Terraform — no live apply)
- **Refs:** Infra §2.1; INF-001; INF-002; INF-003
- **Task:** INF-010
- **Mock date:** 2026-11-11

## Goal

Provision the **DEV** environment as the target for **CI** and **internal developer tests** (Infra §2.1) — distinct from QA (contract/mocks) and PROD (autoscaling user traffic).

## Design

| Concern | Choice |
| --- | --- |
| Account | `mi-iptv-dev` (mock `000000000001`) |
| IaC root | `infra/terraform/environments/dev` |
| Purpose | Continuous integration + internal smoke/integration tests |
| App config | `APP_ENV=dev` (secrets via INF-013 names only) |
| CI identity | OIDC role `mi-iptv-ci-dev` (no long-lived access keys) |

### Stack composition (DEV root)

| Capability | Module / resource | Owning task |
| --- | --- | --- |
| Naming / cost tags | `naming_tags` | INF-002 |
| VPC / SGs | `network` | INF-003 |
| PostgreSQL | `rds_postgres` | INF-020 (+ backups/PITR INF-021) |
| Redis (cache + session) | `elasticache_redis` | INF-022 |
| DNS + ACM TLS | `dns_acm` | INF-004 |
| CI OIDC deploy/test role | `ci_oidc` | **INF-010** |
| API log group | CloudWatch `/mi-iptv/dev/api` | **INF-010** |
| ECS cluster (Fargate) | `dev` cluster, no service yet | **INF-010** (service/image/ALB later) |
| ECR API repository | `ecr` | **INF-005** |
| Catalog artwork CDN | `cdn_artwork` | INF-031 |
| Transactional email (SPF/DKIM/DMARC) | `ses_email_domain` | INF-033 |
| Companion push (FCM / APNs secrets) | secret catalog + docs | INF-034 |
| Anonymous crash reporting (TV + companion) | Crashlytics catalog + docs | INF-054 |
| Cost budgets + anomaly alerts | `cost_budgets` | INF-061 |

Deferred to dedicated tasks (not duplicated here):

| Capability | Task |
| --- | --- |
| ECR + non-root image baseline | INF-005 (module `ecr` + container-image workflow) |
| ALB HTTPS listener | INF-030 |
| PR validation / deploy pipelines | INF-040+ |
| PROD autoscaling 1–5 | INF-012 |

### CI and internal-test contract

| Item | Value (mock) |
| --- | --- |
| Purpose | `ci_and_internal_tests` |
| API FQDN | `api.dev.mi-iptv.example` |
| Realtime FQDN | `realtime.dev.mi-iptv.example` |
| Health check | `GET /health` |
| CI role | `arn:aws:iam::000000000001:role/mi-iptv-ci-dev` |
| GitHub OIDC subjects (mock) | `repo:mi-iptv/mi-iptv-backend:*` |
| Allowed CI actions (stub) | ECS describe/update, ECR push/pull (when INF-005 lands), CloudWatch logs, Secrets Manager read for `mi-iptv/dev/*` only |

Developers use SSO permission set `BackendDeveloper` on DEV (INF-001). CI never uses human credentials.

### Sizing posture (DEV)

Lean defaults already in the env root: single-AZ RDS micro, single-AZ Redis micro, no ALB aliases until INF-030. Desired runtime when live: **1** Fargate task for internal tests (no PROD-style 1–5 autoscaling).

## Module

- `infra/terraform/modules/ci_oidc` — GitHub OIDC provider + `mi-iptv-ci-{env}` role
- Wired **only** into `environments/dev` for this task (QA/PROD attach in INF-011 / INF-012)

## Verification checklist (DoD) — mock complete

- [x] DEV environment defined for CI and internal tests (doc + env contract outputs)
- [x] DEV Terraform root composes foundation modules + CI identity + log group + ECS cluster
- [x] CI assumes OIDC role `mi-iptv-ci-dev` (no access keys in git)

## Live cutover

1. Apply bootstrap + `environments/dev` in account `mi-iptv-dev`.
2. Set real `github_org` / `github_repo` on the CI OIDC module.
3. After INF-005 / INF-030: push image, attach ALB, create ECS service desired_count=1.
4. Point INF-040+ workflows at `mi-iptv-ci-dev` and `api.dev…` health checks.
