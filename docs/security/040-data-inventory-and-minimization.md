# SEC-040: Data inventory and minimization

- **Status:** Accepted (Sprint 0)
- **Refs:** Security §6; NFR-006; BE-011
- **Task:** SEC-040
- **Date:** 2026-11-13

## Goal

Confirm **email is the only personal data** collected for identity/service (Security §6), and **map every field** clients and the backend collect or persist in MVP.

## Verdict

| Question | Answer |
| --- | --- |
| Sole personal data for account identity? | **Yes — `email`** (`app.accounts.email`) |
| Code constant | `PERSONAL_DATA_FIELD_NAMES` in `src/domain/privacy/personal-data-fields.ts` |
| Other columns are… | Secrets, technical/pseudonymous ids, household/device labels, IPTV product state — **not** additional personal identity attributes |

Passwords, tokens, and IPTV source credentials are **secrets**, not “personal data” under §6 minimization, but remain high-sensitivity (SEC-003 / SEC-010 / SEC-012).

## Classification legend

| Class | Meaning |
| --- | --- |
| **Personal** | Identifies a natural person for auth/service (§6) |
| **Secret** | Credential / token material (hashed or encrypted at rest) |
| **Technical** | Opaque ids, sync versions, operational timestamps |
| **Functional** | Product preference / device / catalog state |
| **Transient** | Request-only or short-lived process data (not a durable PII column) |

## Client → backend collection map

| Surface | Fields collected | Class | Persistence |
| --- | --- | --- | --- |
| `POST /auth/login` | `email` | **Personal** | `app.accounts.email` |
| | `password` | Secret | Argon2id `password_hash` only |
| | `deviceId` | Technical | Session / refresh binding |
| | Client IP (implicit) | Transient | Rate-limit keys (hashed account / IP counters in Redis) — not a profile attribute |
| `POST /auth/refresh` | `refreshToken` | Secret | SHA-256 `token_hash` |
| `POST /auth/logout` | access JWT; `allSessions` / `allDevices` (alias) | Secret / Technical | Deny-list + refresh revoke |
| `POST /devices/register` | `deviceType`, `platform` | Functional | `app.devices` |
| | `name`, `model`, `appVersion`, `osVersion` | Functional | Device labels / diagnostics — **not** legal name / contact PII |
| | `pushToken` | Technical (push routing) | Stored; **never returned** on list APIs |
| Device heartbeat | optional `pushToken` | Technical | Updates `push_token` / `last_seen_at` |
| Sources create | `kind`, `name`, `uriRef`, optional `priority`, `credentials` (`username`/`password`/`token`) | Functional + Secret | `uri_ref` clear; `uri_enc` + `credentials_encrypted` ciphertext; API returns masked secrets only |
| Sources update | optional `name`, `uriRef`, `priority`, `enabled`, `credentials` | Functional + Secret | Same as create |
| Sync playback | `contentId`, `positionSec`, `durationSec`, `completed`, `clientEventId`, `syncVersion` / base version, optional `sourceId`, `forceReset`, `clientReportedAt` | Functional / Technical | `app.playback_states` + `app.sync_events` |
| Sync favorites | `contentId`/`itemId`, `type`, `action`, `sortOrder`, `clientEventId`, optional `clientReportedAt` / base version | Functional / Technical | `app.favorites` + sync ledger |
| QoE / crash (clients) | Must use anonymous session/device ids only | Technical | HTTP QoE not wired in this backend yet; §6 requires dissociation from personal data |

## Backend persistence inventory (MVP tables)

### Identity & sessions

| Table / field | Class | Notes |
| --- | --- | --- |
| `accounts.email` | **Personal** | Only §6 personal data |
| `accounts.password_hash` | Secret | PHC; never plaintext |
| `accounts.role`, `status`, `email_verified_at`, `deletion_requested_at`, `last_login_at`, `change_seq`, `tombstone_floor`, timestamps | Technical / Functional | Operational account state — not additional contact PII |
| `profiles.name`, `avatar`, `language`, `region`, `autoplay`, `subtitle_prefs`, `restrictions` | Functional | Household profile label — policy: **do not** solicit legal name / government id |
| `devices` (`device_type`, `platform`, `name`, `model`, `app_version`, `os_version`, `push_token`, `paired_at`, `last_seen_at`, `revoked_at`) | Functional / Technical | Push token not exposed on APIs |
| `refresh_tokens.token_hash` (+ family / device / revoke metadata) | Secret | |
| `password_reset_tokens.token_hash` | Secret | |

### Product / sync / catalog

| Area | Class | Notes |
| --- | --- | --- |
| `user_sources` (`name`, `kind`, `uri_ref`, `uri_enc`, `credentials_encrypted`, `priority`, `enabled`, status fields) | Secret + Functional | IPTV panel secrets, not user contact PII |
| `catalog_providers`, `catalog_items`, `catalog_streams` | Functional | Content metadata |
| `favorites` (+ `type`), `playback_states`, `profile_settings.payload` | Functional | Preferences / progress / settings JSON |
| `sync_events` / `sync_log` | Technical | Idempotency + conflict audit |
| `device_commands` (companion→TV command queue) | Technical / Functional | Ephemeral send-to-TV payloads; no email/PII columns; purged by retention job |

### Schema present but out of MVP HTTP surface

| Area | Class | Notes |
| --- | --- | --- |
| Telemetry / QoE tables (if present in migrations) | Technical | Not exposed by current `/api/v1` routes; when wired must stay anonymous per §6 |

### Explicitly **not** collected (minimization)

No phone number, postal address, government ID, date of birth, payment card, real-name KYC, contacts, precise GPS, or advertising ID as account personal attributes in MVP schema/APIs.

## Verification checklist (DoD)

- [x] Email confirmed as the only personal data for auth/service identity
- [x] Client-collected fields mapped (auth, devices, sources, sync)
- [x] Backend persisted fields classified (schema + BE-011 settings/favorites/sync)

## Follow-ups

- Account erase / export (right to deletion) should treat `email` as the personal anchor and wipe or anonymize linked rows
- Keep profile `name` as a non-legal household label in product copy
- When QoE (`/diagnostics/qoe`) lands, enforce anonymous ids only (Security §6 telemetry rule)
