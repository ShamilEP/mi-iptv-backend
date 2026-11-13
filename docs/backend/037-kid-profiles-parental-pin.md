# BE-037 — Kid profiles and parental PIN

- **Status:** Implemented (in review)
- **Refs:** FR-023; BE-036; Security §2.1 / §4

## Goals

1. Store parental PIN as **Argon2id** hash (`profiles.pin_hash`) — never return hash or clear PIN.
2. **Verify** endpoint with Redis throttling (`rl:pin:{accountId}:{profileId}`, 5 / 15 min).
3. **Content restrictions** by rating and/or source id when that metadata exists on the content.

## Contract

| Method | Path | Purpose |
| --- | --- | --- |
| `PUT` | `/api/v1/profiles/{id}/pin` | Set or clear PIN (`pin` + optional `currentPin`) |
| `POST` | `/api/v1/profiles/{id}/verify-pin` | Verify PIN (`429` + `Retry-After` when locked) |
| `PATCH` | `/api/v1/profiles/{id}/restrictions` | Update `kidMode`, `maxRating`, source allow/deny |

Public profile views expose `pinConfigured: boolean` and structured `restrictions` only.

## Restrictions model

```json
{
  "kidMode": true,
  "maxRating": "PG",
  "allowedSourceIds": ["uuid-or-key"],
  "blockedSourceIds": ["uuid-or-key"]
}
```

`EvaluateContentForProfile` / `evaluateContentAccess`:

- Non-kid profiles → allow.
- Rating / source gates apply **only when** content supplies that metadata.
- Missing metadata on an axis → that axis does not block.

## Migration

`db/migrations/004_profile_pin_parental.sql` adds `app.profiles.pin_hash`.
