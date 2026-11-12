# Sync payload contract (PRD-022 / ADR-005)

- **Status:** Accepted (Product)
- **Refs:** Backend §2.3, §3.1; ADR-005; BE-060

## Playback write

Required: `clientEventId`, `contentId`, `position`, `completed`, `syncVersion`.  
Optional: `duration`, `sourceId`, `forceReset` (default false), `clientReportedAt` (informational only).

**Do not send** `deviceTimestamp`.

## Favorites write

Required: `clientEventId`, `itemId`, `action`, `syncVersion`.

## Delta pull

Use `GET /sync/state?cursor={changeSeq}` (account `change_seq`), not wall-clock client time.
