# BE-106 — Full settings sync

- **Status:** Implemented (in review)
- **Refs:** SRS §7, §23; BE-060; BE-011 (`app.profile_settings`)

## Goals

1. Sync **settings flagged syncable** across devices for a profile.
2. Use the **same conflict rules as favorites**: always accept; `resolvedBy=lww` when client `syncVersion` ≠ server row; idempotent via `clientEventId`.
3. Apply **field-level merge** (SRS §7 LWW por campo): incoming syncable keys overwrite; other syncable keys on the server are preserved.

## Syncable keys

`autoplay`, `subtitlePrefs`, `language`, `region`, `historyEnabled`, `restrictions`

Non-syncable keys in a write payload are ignored. Reads return only syncable keys.

## Contract

| Method | Path | Headers | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/sync/settings` | `x-account-id`, `x-profile-id` | Current syncable settings |
| `POST` | `/api/v1/sync/settings` | + `x-device-id` | Upsert patch (`clientEventId`, `syncVersion`, `payload`) |

Batch: `entity: "setting"` is accepted on `POST /api/v1/sync/events`.

## Notes

- Empty document when no row exists: `syncVersion: 0`, `payload: {}`.
- Shared SyncLog entity = `setting` (already allowed in migration `003`).
- In-memory adapter until Postgres wraps `app.profile_settings`.
