# BE-012: Constraints, indexes, and server-side timestamps

- **Status:** Implemented (awaiting review)
- **Refs:** Backend §3.1; Backend §5.1; BE-010
- **Task:** BE-012
- **Date:** 2026-11-12

## Goal

Harden the core schema so identity uniqueness, tenant FK lifecycle, sync delta
lookups, and row timestamps are enforced by PostgreSQL — not by trusting clients.

## Migration

`db/migrations/002_constraints_indexes_timestamps.sql` (additive on `001`).

| DoD item | Implementation |
| --- | --- |
| Unique email | Guard ensuring `app.accounts.email` keeps a UNIQUE constraint (`citext`) |
| FK cascades | Direct `refresh_tokens.account_id → accounts` **ON DELETE CASCADE**; `user_sources.provider_id → catalog_providers` **ON DELETE RESTRICT** (other tenant FKs already CASCADE in `001`) |
| Delta indexes | `(account_id, updated_at)` and `(account_id, sync_version)` on `playback_states`, `favorites`, `user_sources` |
| Server timestamps | `app.force_row_timestamps()` BEFORE INSERT OR UPDATE on tables with `created_at`/`updated_at` (including `accounts`) |

`001` `change_seq` delta indexes remain the primary sync cursor path used by
`app.sync_delta`. The new indexes support §3.1 version/time scans and tooling.

## Timestamp rules

1. **INSERT** — `created_at` and `updated_at` are set to `clock_timestamp()` (client values ignored).
2. **UPDATE** — `created_at` is restored from `OLD`; `updated_at` advances via the server clock.
3. Client-reported times (e.g. `sync_events.client_reported_at`) stay informational only.

## Out of scope

- Live migrate-before-deploy wiring (**INF-024**)
- Favorites / settings / sync_log shape polish (**BE-011**)
