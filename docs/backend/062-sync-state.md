# BE-062: GET /sync/state

- **Status:** Implemented (MVP in-memory)
- **Refs:** Backend §2.3; FR-033; ADR-005; ADR-009; OpenAPI `getSyncState`
- **Code:** `GetSyncState`, `createSyncStateRoute`, `AccountSyncClock`

## Contract

| Query | Rule |
| --- | --- |
| `cursor` | Last applied account `change_seq` (default `0`) |
| `since` | Deprecated numeric alias for `cursor` (not wall-clock time) |
| `limit` | 1–500 (default 500) |

Response `200`: `{ changes, nextCursor, serverTimestamp, truncated }`  
Entities: `playback_state` \| `favorite` \| `source` (metadata only — no credentials).  
Soft-deletes appear as `deleted: true` (tombstones).

`409` when `cursor < tombstoneFloor` → `{ code: "SYNC_FULL_RESYNC_REQUIRED", tombstoneFloor }`.

## Notes

- Product DoD wording said “since a timestamp”; ADR-005 froze **change_seq** cursor instead.
- Shared `AccountSyncClock` allocates seqs across playback / favorites / sources for in-memory parity with `app.next_change_seq`.
