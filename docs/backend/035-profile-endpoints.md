# BE-035 — Profile endpoints (single profile)

- **Status:** Superseded for list/update transport by **BE-036**
- **Refs:** FR-002; SRS §8; BE-029; BE-036

## Historical MVP contract

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/profiles` | Bearer access JWT | Return the MVP default profile |
| `PATCH` | `/api/v1/profiles` | Bearer access JWT | Partial update of onboarding prefs |

## Mutable fields (PATCH)

`name`, `avatar`, `language`, `region`, `autoplay`, `subtitlePrefs`

Immutable in BE-035: `id`, `accountId`, `isDefault`, `restrictions`, timestamps.

## Behavior

1. Verify access JWT → `accountId`.
2. Load default (or sole) profile for the account.
3. GET returns `ProfilePublic`; PATCH merges provided fields and saves.

## Release 1

Multi-profile CRUD, household limit, and per-profile sync scoping: **[036-multi-profile-management.md](./036-multi-profile-management.md)**.
