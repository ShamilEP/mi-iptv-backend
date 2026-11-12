# Proposed packages for BE-023 (JWT)

**Status:** **Not installed** — BE-023 ships with **Node `crypto` only** (RS256 JWT + SHA-256 refresh hashing).

| Package | Purpose | Decision |
| --- | --- | --- |
| `jose` | JWT + JWKS helpers | **Deferred** — re-propose if we need richer JWKS HTTP export or multi-alg edge cases |
| `jsonwebtoken` | Classic JWT lib | **Rejected** for MVP (callback-style, less ESM-friendly) |

Domain/application use `AccessTokenService` / `RefreshTokenService` ports; infrastructure adapters must not leak vendor SDKs into those layers if a library is approved later.
