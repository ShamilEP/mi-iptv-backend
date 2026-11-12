# BE-010: Core PostgreSQL schema (Backend §5.1)

- **Status:** Accepted (Sprint 0)
- **Refs:** Backend §5.1; BE-007; INF-020; BE-011/012 (follow-ons)
- **Task:** BE-010
- **Date:** 2026-11-12

## Goal

Finalize the **core relational tables** required by Backend §5.1 inside the versioned baseline migration `db/migrations/001_postgres_schema.sql`.

## §5.1 → schema mapping

| §5.1 table | Physical table | Notes |
| --- | --- | --- |
| `accounts` | `app.accounts` | `email` UNIQUE (`citext`); `password_hash`; `status`; `created_at` |
| `devices` | `app.devices` | `device_type` ∈ {tv, companion}; `platform`; `push_token`; `last_seen_at` |
| `profiles` | `app.profiles` | `name`; `language`; composite uniqueness `(id, account_id)` for FK targets |
| `playback_states` | `app.playback_states` | **PK `(profile_id, content_id)`**; `position_sec` / `duration_sec` / `completed` / `sync_version` / `updated_at` |
| `user_sources` | `app.user_sources` | `kind`; `uri_ref` (non-secret); **`credentials_encrypted BYTEA`**; `priority`; full URI also in `uri_enc` |

Secrets are never stored cleartext. Ciphertext columns are written by the application with a KMS-wrapped data key (Security spec §5).

## Out of scope (owned by later tasks)

- Extra tables already present in `001` (favorites, sync_events, refresh_tokens, catalog_*, …) are refined by **BE-011** / catalog tasks — not removed here.
- Unique email / FK cascade / delta-index / server timestamps: **BE-012** (`docs/backend/012-constraints-indexes-timestamps.md`).
- Live migrate-before-deploy: **INF-024**.

## Verification

- Unit test asserts §5.1 table/column markers exist in `001_postgres_schema.sql`.
- CI `migrations` job (BE-007) applies the baseline against Postgres 16.
