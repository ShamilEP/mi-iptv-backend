# BE-036 — Multi-profile management

- **Status:** Implemented (in review)
- **Refs:** FR-022; BE-035; BE-029
- **Limit:** `MAX_PROFILES_PER_ACCOUNT = 5` (includes the registration default)

## Contract

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/profiles` | Bearer | List all profiles for the account |
| `POST` | `/api/v1/profiles` | Bearer | Create a profile (409 if limit reached) |
| `GET` | `/api/v1/profiles/{id}` | Bearer | Get one owned profile |
| `PATCH` | `/api/v1/profiles/{id}` | Bearer | Partial update; may set `isDefault: true` |
| `DELETE` | `/api/v1/profiles/{id}` | Bearer | Delete profile + cascade favorites/progress (409 if last) |
| `GET` | `/api/v1/sync/playback-history` | `x-account-id` + `x-profile-id` | Progress/history for one profile |

## Scoping

Favorites, playback progress, and history are keyed by `profile_id` in the schema. Sync use cases call `requireOwnedProfile` so a foreign `x-profile-id` returns `PROFILE_NOT_FOUND`. Deleting a profile removes its favorites and playback rows.

## Notes

- Registration still seeds exactly one default via `CreateDefaultProfile` (BE-029).
- Parental `restrictions` / PIN remain Release 1 follow-up (BE-037).
- Breaking vs BE-035: `GET/PATCH /profiles` without `{id}` is replaced by list + `{id}` routes.
