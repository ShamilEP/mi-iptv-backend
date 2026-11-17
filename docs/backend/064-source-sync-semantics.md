# BE-064: Source sync semantics

- **Status:** Implemented (MVP)
- **Refs:** FR-033; ADR-009 / PRD-023; BE-040; BE-062
- **Code:** `CreateSource` / `UpdateSource` / `DeleteSource`, `toSourceDelta`, `source-sync.ts`

## Decision applied (ADR-009)

| Concern | Behavior |
| --- | --- |
| Replicate across devices | CRUD bumps account `change_seq`; peers pull `entity: "source"` on `GET /sync/state` |
| Mutations | `/sources` only — `POST /sync/events` rejects `entity: "source"` (`SOURCE_SYNC_BATCH_FORBIDDEN`) |
| Secrets | Never in list/delta payloads; soft-delete clears ciphertext |
| Full list | `GET /sources` (masked credentials) |

## Guards

- `AccountSyncClock` is **required** on source create/update/delete
- `assertSourceDeltaHasNoSecrets` runs when projecting deltas
