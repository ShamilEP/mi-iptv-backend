# BE-035 — Profile endpoints (single profile)

- **Status:** Implemented (in review)
- **Refs:** FR-002; SRS §8; BE-029

## Contract

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/profiles` | Bearer access JWT | Return the MVP default profile |
| `PATCH` | `/api/v1/profiles` | Bearer access JWT | Partial update of onboarding prefs |

## Mutable fields (PATCH)

`name`, `avatar`, `language`, `region`, `autoplay`, `subtitlePrefs`

Immutable: `id`, `accountId`, `isDefault`, `restrictions` (parental / Release 1), timestamps.

## Behavior

1. Verify access JWT → `accountId`.
2. Load default (or sole) profile for the account.
3. GET returns `ProfilePublic`; PATCH merges provided fields and saves.
