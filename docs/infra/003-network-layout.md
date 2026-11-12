# INF-003: Network layout

- **Status:** Accepted (Sprint 0 **mock** Terraform — no live apply)
- **Refs:** Infra §2.2; ADR-001; INF-001; INF-002
- **Task:** INF-003
- **Mock date:** 2026-11-11

## Goal

Provide a VPC with public and private subnets, **private** placement for RDS and Redis, security groups, and **controlled egress** (reduces SSRF blast radius from the app tier).

## Design

| Tier | Subnets | Internet | Purpose |
| --- | --- | --- | --- |
| Public | 2× AZ | IGW | ALB (+ NAT EIP) |
| Private app | 2× AZ | NAT only | ECS Fargate tasks |
| Private data | 2× AZ | **none** | RDS PostgreSQL, ElastiCache Redis |

Default CIDRs (overridable):

| Env | VPC CIDR |
| --- | --- |
| `dev` | `10.10.0.0/16` |
| `qa` | `10.20.0.0/16` |
| `prod` | `10.30.0.0/16` |

### Security groups

| SG | Ingress | Egress |
| --- | --- | --- |
| `alb` | 443 (and 80) from internet | to `app` on container port |
| `app` | container port from `alb` only | TCP 443 + DNS 53 + to `db`/`redis` SGs only (no all-traffic) |
| `db` | 5432 from `app` only | none |
| `redis` | 6379 from `app` only | none |

### Controlled egress / SSRF

- Data subnets have **no** NAT route — DB/Redis cannot initiate internet access.
- App egress is **not** `0.0.0.0/0 all traffic`; HTTPS + DNS only via NAT (no TCP/80 → IMDS blocked at SG).
- Private-app **NACL** (SEC-031) additionally **denies** `169.254.0.0/16` egress before allow rules.
- Application SSRF guards (BE-041) re-check DNS/redirects; attack matrix in `docs/security/031-ssrf-protection-tests.md`.

MVP uses **one NAT gateway** (cost). Prod HA (NAT per AZ) is a follow-up.

## Module

`infra/terraform/modules/network` — wired from `environments/{dev,qa,prod}`.

## Verification checklist (DoD) — mock complete

- [x] VPC and subnets (public / private app / private data)
- [x] Private DB and Redis placement (data subnets + SGs)
- [x] Security groups as above
- [x] Controlled egress (restricted app SG + isolated data tier)

## Live cutover

`terraform init -backend-config=backend.hcl && terraform plan` in each env after AWS accounts exist.
