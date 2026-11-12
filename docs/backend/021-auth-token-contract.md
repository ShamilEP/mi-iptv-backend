# Auth token contract (PRD-021 / ADR-004)

- **Status:** Accepted (Product)
- **Refs:** Backend §2.1; Security §2.2; ADR-004; BE-023

| Item | Value |
| --- | --- |
| Access alg | **RS256** + JWT `kid` |
| Access TTL | **3600** seconds (`expiresIn`) |
| Refresh TTL | **30 days**, device-bound, hashed in `app.refresh_tokens` |

HS256 is out of scope for MVP.

Implementation: **BE-023** — `docs/backend/023-jwt-issuance-and-keys.md`.
