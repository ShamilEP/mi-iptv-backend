# BE-025 — POST /auth/logout and revocation

- **Status:** Implemented (in review)
- **Refs:** FR-032; Security §2.2; INF-022; BE-024

## Contract

- **Path:** `POST /api/v1/auth/logout`
- **Auth:** `Authorization: Bearer <accessJWT>` (or body `accessToken`)
- **Body (optional):** `allSessions` / `allDevices` (boolean) — close every account session
- **Response 200:** `{ status: "OK", scope: "device" | "account" }`

## Behavior

1. Verify access JWT (RS256).
2. Deny-list `jti` in Redis/Valkey as `jwt:deny:{jti}` with TTL = remaining access life.
3. Default: revoke active refresh tokens for `(accountId, deviceId)` with reason `logout`.
4. `allSessions=true`: also set `jwt:acct-epoch:{accountId}` and revoke all account refresh tokens (`logout_all`).
5. `AssertAccessTokenActive` checks jti deny-list + account epoch (for middleware / tests).

Sprint 0 uses `InMemoryRedisClient` when `REDIS_URL` is unset; otherwise `IoredisRedisClient`.
