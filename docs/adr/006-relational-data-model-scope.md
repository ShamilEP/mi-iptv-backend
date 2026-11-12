# ADR-006: Relational data model scope (Backend §5.1 vs SRS)

- **Status:** Accepted
- **Date:** 2026-11-12
- **Deciders:** Product (PRD-024)
- **Refs:** Backend §5.1; SRS §6–7; BE-010; BE-011; `db/migrations/001_postgres_schema.sql`

## Context

Backend §5.1 lists five core tables (`accounts`, `devices`, `profiles`, `playback_states`, `user_sources`). SRS §6–7 also require favorites, settings, sync_log, and password-reset storage. The tracker treated this as a conceptual gap (PRD-024) before **BE-011**.

## Decision

1. **Backend §5.1 is the MVP “core five”** — the minimum account/content-progress surface called out in the Backend persistence section.
2. **The physical PostgreSQL model is larger** and is authoritative for implementation. SRS entities map as follows:

| SRS / conceptual name | Physical table / storage | Status |
| --- | --- | --- |
| accounts | `app.accounts` | In §5.1 + schema |
| devices | `app.devices` | In §5.1 + schema |
| profiles | `app.profiles` | In §5.1 + schema |
| playback / progress | `app.playback_states` | In §5.1 + schema |
| user IPTV sources | `app.user_sources` | In §5.1 + schema |
| favorites | `app.favorites` | Schema present (beyond §5.1 list) |
| sync_log | `app.sync_events` (+ view `app.sync_log`, BE-011) | Schema present (idempotency + conflict audit) |
| password-reset tokens | `app.password_reset_tokens` | Schema present |
| refresh-token metadata | `app.refresh_tokens` | Schema present |
| settings | **`app.profile_settings`** (syncable JSONB; BE-011) + legacy profile JSON columns | Done (BE-011) |

3. Backend §5.1 docs must **reference** the extended tables (or point to the migration) so Product/Backend stay aligned — not pretend only five tables exist in the database.

## Consequences

- **BE-011** focuses on true gaps vs SRS (e.g. dedicated syncable settings if required), not re-creating favorites / sync_log / password-reset that already exist.
- Unblocks sync/auth persistence stories that depend on a clear model, then **BE-121** integration coverage once HTTP routes exist.
- Catalog tables (`catalog_*`) remain ingestion concerns, not part of the §5.1 “core five.”

## Rejected for MVP

- Shrinking the live schema down to only the five §5.1 tables (would break sync/auth designs already drafted).
- Treating SRS names as literal table names when a clearer physical name already exists (`sync_events` vs `sync_log`).
