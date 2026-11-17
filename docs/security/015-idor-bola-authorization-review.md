# SEC-015: Authorization review (IDOR / BOLA)

- **Status:** Accepted (MVP)
- **Refs:** SRS §8; BE-006; BE-080; ADR-008; schema RLS (`app.current_account_id`)
- **Task:** SEC-015
- **Date:** 2026-11-17

## Goal

Confirm every implemented API surface is **tenant-scoped** (account, and profile where applicable), that **send-to-TV / remote delivery** cannot target another account’s devices, and that **automated negative tests** lock the regressions.

## Trust model

| Layer | Control |
| --- | --- |
| Gateway (BE-006) | JWT required for `/api/v1/*` (except public auth); `accountId` / claims from verified token — never from client-supplied `x-account-id` alone |
| Application | Repositories take `accountId` first; profile paths use `requireOwnedProfile` |
| Postgres (later) | RLS `tenant_isolation` on `profiles`, `devices`, `user_sources`, `favorites`, `playback_states`, `device_commands`, `sync_events` |
| Realtime | WSS JWT + `deviceId` bind; client `event` frames only on `dev:{ownDeviceId}` |
| Send-to-TV | Path sender = JWT device; target TV via `findById(accountId, …)` |

## Endpoint scoping matrix (implemented)

| Surface | Account scope | Profile scope | Notes |
| --- | --- | --- | --- |
| Auth register/login/refresh/logout | N/A / self | — | Public or token-bound |
| Account export / delete | JWT account | — | Claims only |
| Profiles CRUD / PIN / restrictions | JWT → `requireOwnedProfile` / list by account | Path `{id}` | Cross-account → `PROFILE_NOT_FOUND` |
| Watch history / privacy | JWT account | Path `{id}` owned | |
| Sources CRUD / test | JWT `accountId` + `findById(accountId, id)` | — | Cross-account → `SOURCE_NOT_FOUND` |
| Devices list/register/unlink/heartbeat | JWT `accountId` + device `findById(accountId, id)` | — | Same-account device ops allowed; cross-account → `DEVICE_NOT_FOUND` |
| `POST …/send-to-tv` | JWT account + owned sender/target | — | Target must be **TV**; foreign TV → `DEVICE_NOT_FOUND`; sender ≠ JWT → `403` |
| Sync state / playback / favorites / settings / events | JWT account | `x-profile-id` + `requireOwnedProfile` | Foreign profile → `PROFILE_NOT_FOUND` |
| WSS `/realtime` | JWT account + device claim | — | Publish only to own `dev:{deviceId}` channel |
| `GET /health` | Public | — | No tenant data |

Catalog list/search/detail and diagnostics QoE remain **not implemented** in this inventory pass; they must reuse the same account (and profile where content is profile-scoped) pattern when shipped.

## Send-to-TV & remote commands

| Attack | Mitigation | Evidence |
| --- | --- | --- |
| Send play to another account’s TV | Target loaded with attacker `accountId` | `SendToTv` → `DEVICE_NOT_FOUND` |
| Forge path `{id}` as another device | JWT `deviceId` must equal path sender | `SEND_TO_TV_SENDER_MISMATCH` (403) |
| Auto-pick among TVs / omit target | Rejected | ADR-008; empty / non-TV target errors |
| WSS publish onto `dev:{victimDeviceId}` | Gateway drops non-own channel | `NodeRealtimeGateway.onFrame` channel pin |
| Fan-out without prior AuthZ | `FanOutDeviceCommand` only composed behind `SendToTv` / flush after owned queue rows | `main.ts` |

Live D-pad / keyboard remain fire-and-forget on the **caller’s** device channel (ADR-007); they are not persisted and cannot retarget another account’s channel through this gateway.

## Verification checklist (DoD)

- [x] Every implemented endpoint scoped by account (and by profile when the resource is profile-owned)
- [x] Send-to-TV and realtime remote delivery constrained to the same account’s devices
- [x] Automated negative tests for cross-account profile, source, device, send-to-TV, sync profile header, and WSS channel pin

## Residual risks / follow-ups

- Postgres adapters must set `app.current_account_id()` per request so RLS matches application checks (defense in depth).
- Unimplemented catalog/diagnostics routes need the same negative-test treatment when marked implemented.
- Same-account confused-deputy (device A heartbeats device B) is accepted for MVP account-scoped device APIs; tighten to JWT device bind if product requires it.
