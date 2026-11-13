# INF-002: Infrastructure as code

- **Status:** Accepted (Sprint 0 **mock** baseline)
- **Refs:** ADR-003; ADR-001; INF-001; Infra §2
- **Task:** INF-002
- **Mock date:** 2026-11-10

## Goal

Adopt IaC for AWS resources with **remote state**, **naming**, and **cost tags**, so later provisioning (network, compute, data) is repeatable.

## Sprint 0 mock decision

Live `terraform apply` is deferred (no AWS org admin / CLI in agent env; accounts remain INF-001 mocks). This repo’s Terraform layout, remote-state contract, and tagging module are the accepted Sprint 0 baseline. Resources are stubbed as “to be filled by later INF tasks,” not applied.

## Layout

```text
infra/terraform/
  modules/naming_tags/     # required tags + name prefix
  modules/cost_budgets/    # INF-061 budgets + anomaly alerts
  bootstrap/               # remote state bucket + lock table (per account)
  environments/dev|qa|prod # env roots (remote backend + tags wiring)
```

## Remote state (mock names)

| Env | State bucket (mock) | Lock table (mock) | Key prefix |
| --- | --- | --- | --- |
| `dev` | `mi-iptv-tfstate-dev-000000000001` | `mi-iptv-tf-locks-dev` | `platform/terraform.tfstate` |
| `qa` | `mi-iptv-tfstate-qa-000000000002` | `mi-iptv-tf-locks-qa` | `platform/terraform.tfstate` |
| `prod` | `mi-iptv-tfstate-prod-000000000003` | `mi-iptv-tf-locks-prod` | `platform/terraform.tfstate` |

Backend region (mock): `us-east-1`. Encrypt state at rest (SSE-S3 or SSE-KMS when live).

## Naming and cost tags

Every tagged resource must include at least:

| Tag | Example |
| --- | --- |
| `Project` | `mi-iptv` |
| `Environment` | `dev` / `qa` / `prod` |
| `ManagedBy` | `terraform` |
| `CostCenter` | `mi-iptv-mvp` |

Name prefix pattern: `mi-iptv-{env}-*`.

## Verification checklist (DoD) — mock complete

- [x] IaC tool chosen (Terraform — ADR-003)
- [x] Repo layout for modules + per-env roots covering future resources
- [x] Remote state backend contract documented + configured in env roots
- [x] Naming and cost tags module defined and wired

## Live cutover

1. Create real state buckets/tables via `bootstrap/` in each account.
2. `terraform init` / `plan` / `apply` for bootstrap then environment roots.
3. Expand modules as INF-003+ land (VPC, ECS, RDS, etc.).
