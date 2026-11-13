# BE-067 — Accept batched offline events

- **Status:** Implemented (in review)
- **Refs:** SRS §7; local SQLite `outbox`; ADR-005; BE-061 / BE-063

## Contract

- **Path:** `POST /api/v1/sync/events`
- **Headers (Sprint 0):** `x-account-id`, `x-profile-id`, `x-device-id`
- **Body:** `{ "events": [ ... ] }` where each item is a tagged ADR-005 write:
  - `entity: "playback_state"` + playback fields
  - `entity: "favorite"` + favorite fields
- **Limits:** `1..100` events (`SYNC_BATCH_MAX_EVENTS`)
- **Response 200:** `{ status: "OK", results: [ per-event decision... ] }`

## Behavior

1. Reject empty / oversized batches (`SYNC_BATCH_INVALID` / `SYNC_BATCH_TOO_LARGE`).
2. Process events in array order via existing `UpsertPlaybackState` / `SetFavorite`.
3. Per-event idempotency on `(accountId, clientEventId)` unchanged.
4. MVP entities match the client outbox: `playback_state` and `favorite` (sources wait on BE-064).
