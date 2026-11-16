# ADR-010: MVP API endpoint inventory (Backend §2)

- **Status:** Accepted
- **Date:** 2026-11-15
- **Deciders:** Product (PRD-025)
- **Refs:** SRS §8; Backend §2; FR-012, FR-024, FR-028, FR-029, FR-032; ADR-007–009; BE-003

## Context

SRS §8 lists `/profiles`, `/epg`, and `/diagnostics` that Backend §2 omitted. Other gaps blocked a frozen OpenAPI v1 (**BE-003**): `PATCH /sources`, content detail, password-reset confirm, realtime handshake, and `/health`.

EPG implementation tasks (**BE-100–103**) are **Release 1**; diagnostics and catalog detail are MVP-phase.

## Decision

**Package A — MVP complete, EPG deferred.**

Freeze the following in Backend §2 / OpenAPI MVP (paths under `/api/v1` unless noted). Existing §2.1–2.4 endpoints remain; this ADR **adds** the missing ones and names path shapes.

### Additions (MVP)

| Area | Method + path | Notes |
| --- | --- | --- |
| Ops | `GET /health` | Outside `/api/v1`; ALB / ECS probe |
| Profiles | `GET` `POST /profiles`; `GET` `PATCH` `DELETE /profiles/{id}` | Multi-profile; PIN / restrictions / privacy / history as already specified in implementation docs |
| Sources | `PATCH /sources/{id}` | Edit, priority, disable (FR-024); complements POST/GET/DELETE |
| Catalog | `GET /catalog/items/{id}` | Content detail (FR-012): synopsis, art, duration, streams metadata |
| Auth | `POST /auth/reset-password/confirm` | Body: reset token + new password; invalidate sessions (BE-026) |
| Diagnostics | `POST /diagnostics/qoe` | QoE ingestion (FR-029); anonymous session id; honor opt-out |
| Diagnostics | `GET /diagnostics/network` | Lightweight latency for client diagnostics (FR-028) |
| Realtime | **WSS** handshake | Authenticated WebSocket per ADR-007 (e.g. `wss://…/realtime` or `realtime.*` host); JWT + `deviceId`; not SSE |

Also keep already-documented MVP surfaces: auth register/login/refresh/logout/reset-password request, sources CRUD + test, catalog channels/vod/search, sync (state/playback/favorites/settings/events per ADR-005/009), devices register/list/heartbeat/send-to-tv/companion-status, account export/delete.

### Out of MVP OpenAPI freeze

| Area | Paths | Phase |
| --- | --- | --- |
| EPG | `GET /epg` (by channel + time range), now/next helpers | **Release 1** (BE-103); do not require in BE-003 MVP freeze |

Optional later (not required for this ADR): `POST /realtime/ticket` short-lived WSS upgrade token.

## Consequences

- **BE-003** OpenAPI v1 must include Package A paths and exclude EPG from the MVP freeze (may document EPG under a “Release 1” tag later).
- Backend §2 gains subsections for profiles, diagnostics, health, content detail, reset confirm, and a realtime WSS note.
- Aligns with code already shipping profiles / `PATCH /sources` / `/health`.
- Unblocks parallel TV/companion contract work once BE-003 lands.

## Rejected for MVP

- Freezing EPG in OpenAPI MVP before Release 1 delivery (Package B).
- Deferring diagnostics from the v1 freeze (Package C).
- REST-only “realtime handshake” instead of WSS (conflicts ADR-007).
- Alternate detail path `GET /catalog/content/{id}` — prefer `items/{id}` for a single canonical content model.
