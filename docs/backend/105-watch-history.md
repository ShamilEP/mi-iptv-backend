# BE-105 — Watch history

- **Status:** Implemented (in review)
- **Refs:** FR-021; BE-036; BE-061
- **Migration:** `db/migrations/005_watch_history.sql`

## Goals

1. Per-profile **watch history** as a view independent of Continue Watching (`playback_states` / `GET /sync/playback-history`).
2. **Privacy toggle** (`historyEnabled`) per profile.
3. **Clear history** without clearing Continue Watching progress.

## Contract

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/profiles/{id}/history` | List history (`historyEnabled` + `items`) |
| `POST` | `/api/v1/profiles/{id}/history` | Append a history entry |
| `DELETE` | `/api/v1/profiles/{id}/history` | Clear history rows only |
| `GET` | `/api/v1/profiles/{id}/privacy` | Read privacy toggle |
| `PATCH` | `/api/v1/profiles/{id}/privacy` | Set `historyEnabled` |

Auth: Bearer access JWT. Ownership via profile account scope.

## Privacy

- Default: `historyEnabled = true` on new profiles.
- When `false`: `GET` returns `{ historyEnabled: false, items: [] }`; `POST` returns `403 HISTORY_PRIVACY_DISABLED`. Existing rows are retained until clear or re-enable.
- Profile public views expose `historyEnabled`.

## Separation from Continue Watching

| Concern | Store | Endpoint |
| --- | --- | --- |
| Continue Watching / progress sync | `playback_states` | `POST/GET …/sync/playback-*` |
| Watch history | `watch_history` | `/profiles/{id}/history` |

Clearing history does **not** tombstone or delete `playback_states`.

## Cascade / export

Profile delete and account delete remove history rows. Account export includes `watchHistory` and `historyEnabled` on profiles.
