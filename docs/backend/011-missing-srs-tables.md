# BE-011: Missing SRS §6 tables

- **Status:** Implemented (awaiting review)
- **Refs:** SRS §6–7; ADR-006; BE-010; PRD-024
- **Task:** BE-011
- **Date:** 2026-11-12

## Goal

Close the gap between Backend §5.1’s core five and SRS §6 entities: favorites (with `type`), settings, sync_log, password-reset tokens, and refresh-token metadata.

## Migration

`db/migrations/003_missing_srs_tables.sql` (additive after `001` + `002`).

| DoD item | Implementation |
| --- | --- |
| favorites + `type` | `app.favorites.type` ∈ {`channel`,`vod`} (backfilled from `catalog_items`) |
| settings | **`app.profile_settings`** — one row per profile, syncable `payload` JSONB + `sync_version` / `change_seq` / `updated_at` |
| sync_log | **`app.sync_log`** view alias of `app.sync_events` (physical ledger unchanged) |
| password_reset_tokens | Confirmed in `001` + table comments |
| refresh-token metadata | Confirmed in `001` (`family_id`, hash, rotation, revocation) + comments |

## Notes

- Profile JSON columns (`subtitle_prefs`, …) remain; `profile_settings.payload` is the syncable settings document (seeded from those columns when present).
- `sync_events.entity` CHECK extended with `'setting'` for future sync writes.
- RLS enabled on `profile_settings` (tenant + worker policies).
- Note: `001` footer still lists `profile_settings` under “Release 1”; physical table ships in `003` (checksum of `001` left unchanged).
