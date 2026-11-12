# ADR-005: Sync write payload contract

- **Status:** Accepted
- **Date:** 2026-11-12
- **Deciders:** Product (PRD-022)
- **Refs:** Backend §2.3, §3.1; FR-033, FR-034; BE-060; schema `app.upsert_playback_state` / `app.set_favorite`

## Context

Backend §3.1 requires **`clientEventId`** (idempotency) and **`forceReset`** (playback conflict override). The §2.3 request example omits both and sends **`deviceTimestamp`**, which conflicts with “server clock is authoritative.”

## Decision

### Required / optional fields (playback write)

`POST /api/v1/sync/playback-state` body:

| Field | Required | Notes |
| --- | --- | --- |
| `clientEventId` | **yes** | UUID; stable across retries |
| `contentId` | yes | Canonical content id |
| `position` | yes | Seconds (maps to `position_sec`) |
| `duration` | no | Seconds |
| `completed` | yes | boolean |
| `sourceId` | no | Active source |
| `syncVersion` | yes | Last version the client observed (`baseVersion`) |
| `forceReset` | no | Default `false`; when `true`, wins over max-position window |
| `clientReportedAt` | no | Informational only (clock-skew / QA); **never** used for LWW |

**Remove** `deviceTimestamp` from the contract.

### Favorites write

`POST /api/v1/sync/favorites` must also include **`clientEventId`** (required). Keep `itemId`, `action` (`add`\|`remove`), `syncVersion`; `type` remains optional metadata for clients.

### Authoritative time

- Conflict and LWW use **server arrival time** / DB `updated_at` / `change_seq`.
- Responses expose `serverTimestamp` (and `accepted`, `currentVersion`, `resolvedBy` when useful).

### Delta pull

- Prefer cursor **`change_seq`** (`GET /sync/state?cursor={n}`) over wall-clock `since={timestamp}` for MVP (matches `app.sync_delta`). Document `since` as deprecated / not authoritative if kept temporarily for clients.

## Consequences

- Update Backend §2.3 examples to include `clientEventId` / `forceReset` and drop `deviceTimestamp`.
- Unblocks **BE-060** sync domain module and later sync HTTP tasks → sync coverage in **BE-121**.
- Schema helpers already match this model (`client_event_id`, `p_force_reset`, `client_reported_at`).

## Rejected for MVP

- Treating device/local clocks as authoritative for conflict resolution.
- Omitting `clientEventId` (breaks offline retry safety).
