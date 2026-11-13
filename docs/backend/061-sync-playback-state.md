# BE-061 — POST /sync/playback-state

- **Status:** Implemented (in review)
- **Refs:** Backend §2.3, §3.1; ADR-005; FR-033/034; BE-060 domain

## Contract

- **Path:** `POST /api/v1/sync/playback-state`
- **Headers (Sprint 0):** `x-account-id`, `x-profile-id`, `x-device-id`
- **Body:** ADR-005 playback write (`clientEventId`, `contentId`, `position`, `completed`, `syncVersion`, optional `duration` / `sourceId` / `forceReset` / `clientReportedAt`)
- **Response 200:** `status`, `accepted`, `currentVersion`, `serverTimestamp`, `resolvedBy`, `changeSeq`

## Behavior

1. Idempotent on `(accountId, clientEventId)` — replays prior outcome.
2. Conflict rules from `decidePlaybackWrite` (BE-060): optimistic `syncVersion`, 60s max-position, `forceReset`, else server-clock LWW.
3. Persistence via `PlaybackSyncRepository` (in-memory for Sprint 0; Postgres can wrap `app.upsert_playback_state`).
