# BE-075: Device registration and management

- **Status:** Implemented (awaiting review)
- **Refs:** FR-035; Backend §2.4; BE-010
- **Task:** BE-075
- **Date:** 2026-11-12

## Goal

Register and manage account devices (Android TV / Companion): register, list,
unlink, and heartbeat (`last_seen_at`).

## Endpoints

| Method | Path | Behavior |
| --- | --- | --- |
| `POST` | `/api/v1/devices/register` | Register `tv` \| `companion` + platform + optional push token |
| `GET` | `/api/v1/devices` | List non-revoked devices |
| `DELETE` | `/api/v1/devices/{id}` | Unlink (set `revoked_at`, clear push token) |
| `POST` | `/api/v1/devices/{id}/heartbeat` | Update `last_seen_at` (+ optional push token) |

Auth stand-in: `x-account-id` until JWT (BE-023).

## Rules

- `tv` ↔ `android_tv`; `companion` ↔ `android` \| `ios`
- API never returns raw `pushToken` — only `pushTokenConfigured`
- Sprint 0 persistence: `InMemoryDeviceRepository` (`pg` approved — wire Postgres adapter over `RelationalDatabase` next)

## Out of scope

- `POST /devices/{id}/send-to-tv` realtime (later devices/realtime tasks)
- Refresh-token revocation cascade on unlink (auth module)
