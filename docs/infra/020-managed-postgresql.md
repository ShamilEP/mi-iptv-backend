# INF-020: Managed PostgreSQL (RDS)

- **Status:** Accepted (Sprint 0 **mock** Terraform — no live apply)
- **Refs:** Infra §2.2; NFR-014 (≥99% API availability); ADR-001; INF-003; INF-002
- **Task:** INF-020
- **Mock date:** 2026-11-11

## Goal

Provision **Amazon RDS for PostgreSQL** in private data subnets with env-appropriate sizing, a custom parameter group, required extensions for the `app` schema, and an HA choice that supports **≥99%** availability for production.

## Design

| Concern | Choice |
| --- | --- |
| Engine | PostgreSQL **16** (schema targets 15+; UTF8 / UTC) |
| Placement | Private **data** subnets from INF-003 (no NAT / no public IP) |
| Access | `db` security group — TCP **5432** from `app` SG only |
| Auth secret | RDS `manage_master_user_password` → AWS Secrets Manager (no password in git) |
| App config | Backend reads **`DATABASE_URL`** only (name from INF-013); never commit URL |

### Sizing (MVP)

| Env | Instance | Storage (gp3) | Multi-AZ | Backup retention | Deletion protection |
| --- | --- | --- | --- | --- | --- |
| `dev` | `db.t4g.micro` | 20 GiB | No | 1 day | Off |
| `qa` | `db.t4g.small` | 50 GiB | Yes | 3 days | Off |
| `prod` | `db.t4g.medium` | 100 GiB | **Yes** | 7 days | On |

Daily automated backups match Infra §2.2. Storage autoscaling ceiling is set in Terraform (`max_allocated_storage`) to absorb catalog growth without manual resize for MVP.

### Private networking

- DB subnet group spans INF-003 **private-data** subnets (2 AZs).
- `publicly_accessible = false`.
- Data tier has **no** internet route (INF-003); RDS cannot initiate egress.
- Ingress only via network module `db` SG from `app` SG on 5432.

### Parameter group

Custom family `postgres16` parameter group (name `mi-iptv-{env}-pg16`):

| Parameter | Value | Why |
| --- | --- | --- |
| `timezone` | `UTC` | Server clock authoritative (sync / schema convention) |
| `rds.force_ssl` | `1` | TLS required from app → RDS |
| `log_min_duration_statement` | `500` | Surface slow queries in CloudWatch (ms) |
| `shared_preload_libraries` | `pg_stat_statements` | Query diagnostics without app changes |

### Extensions

Created by schema migration (`db/migrations/001_postgres_schema.sql`), not by Terraform SQL (no live DB in Sprint 0):

| Extension | Purpose |
| --- | --- |
| `citext` | Case-insensitive email |
| `pg_trgm` | Fuzzy / prefix search (`gin_trgm_ops`) |
| `unaccent` | Diacritic-insensitive `app.norm_text()` |

All three are supported on RDS PostgreSQL 16; live cutover runs migrations after first connect.

### HA and ≥99% availability (NFR-014)

| Env | HA choice | Rationale |
| --- | --- | --- |
| `prod` | **Multi-AZ** synchronous standby | AWS RDS Multi-AZ monthly SLA **99.95%** (≥99% NFR) |
| `qa` | Multi-AZ | Exercises failover path before prod |
| `dev` | Single-AZ | Cost; outages acceptable for internal use |

API availability also depends on ECS/ALB (later INF tasks); this task covers the **database** contribution to the ≥99% target via Multi-AZ on prod (and qa).

## Module

`infra/terraform/modules/rds_postgres` — wired from `environments/{dev,qa,prod}` using network outputs (`private_data_subnet_ids`, `db_security_group_id`).

## Verification checklist (DoD) — mock complete

- [x] Sizing per env (instance class + storage + autoscaling ceiling)
- [x] Private networking (data subnets, no public access, db SG)
- [x] Parameter group (`timezone`, SSL, slow-query, `pg_stat_statements`)
- [x] Extensions documented (`citext`, `pg_trgm`, `unaccent` via migration)
- [x] HA choice meeting ≥99% for prod (Multi-AZ / 99.95% SLA)

## Live cutover

1. Ensure INF-003 network is applied in the target account.
2. `terraform plan` / `apply` in the env root (master secret created in Secrets Manager).
3. Compose `DATABASE_URL` from endpoint + secret; store under `mi-iptv/{env}/database_url` (INF-013).
4. Run `db/migrations/001_postgres_schema.sql` (creates extensions + `app` schema).
5. Point ECS task env at `DATABASE_URL` (name only in app config).
