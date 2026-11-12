# BE-007: DB migration tooling and seed data

- **Status:** Accepted (Sprint 0)
- **Refs:** NFR-014; BE-002; INF-020; INF-024 (later pipeline hardening)
- **Task:** BE-007
- **Date:** 2026-11-11

## Goal

Provide **versioned, backward-compatible** SQL migrations that can run from **CI**, plus **seed data for DEV and QA** (never PROD by default).

## Design

| Concern | Choice |
| --- | --- |
| Format | Numbered SQL files under `db/migrations/` (`NNN_description.sql`) |
| Ledger | `public.schema_migrations` (version + checksum + applied_at) |
| Runner | `scripts/db-migrate.ts` via **`psql`** + `DATABASE_URL` (no new npm DB driver yet) |
| Seeds | `db/seeds/{dev,qa}/*.sql` via `scripts/db-seed.ts` |
| CI | PR job `migrations` — Postgres 16 service, migrate, then seed DEV + QA |
| Compatibility | Forward-only expand/contract; no destructive drops in the same release as the app that still needs the column |

### Why `psql` (for now)

Application code still has no approved PostgreSQL client package. The migrator shells out to `psql` (Node built-ins + CI `postgresql-client`). When the app needs query access, prefer proposing **`pg`** (node-postgres) behind a port — see `docs/dev/proposed-packages-BE-007.md`.

### Backward compatibility

1. Prefer additive migrations (`ADD COLUMN … NULL`, new tables/indexes).
2. Do not `DROP` / rename in the same deploy that still runs old app code (expand → migrate app → contract).
3. Re-applying an already-recorded version is a no-op; checksum mismatch fails the run.

### Commands

```bash
# Requires psql on PATH and DATABASE_URL (never commit real URLs).
npm run db:migrate
APP_ENV=dev npm run db:seed
APP_ENV=qa npm run db:seed
```

### Seeds

| Env | Purpose |
| --- | --- |
| `dev` | Internal smoke account + default profile |
| `qa` | Contract-test account + default profile |
| `prod` | **Refused** by `db:seed` unless `ALLOW_PROD_SEED=1` (not used in Sprint 0) |

Seeds are idempotent (`ON CONFLICT DO NOTHING`) and use placeholder password hashes (not real login material until BE-021).

### Relation to BE-010 / INF-024

- `001_postgres_schema.sql` is the current baseline SQL; **BE-010** owns validating/finalizing the core schema DoD.
- **INF-024** wires migrate-before-deploy + rollback notes once deploy pipelines exist (INF-042).

## Verification checklist (DoD)

- [x] Versioned migrations with ledger + checksum
- [x] Backward-compatible policy documented
- [x] Runnable from CI (`migrations` job on PR validation)
- [x] Seed data for DEV and QA
