# BE-013 — Account deletion and data export

- **Status:** Implemented (in review)
- **Refs:** NFR-006; Security §6; BE-011; SEC-040

## Contract

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/account/export` | Bearer access JWT | Privacy-safe dump of account-owned data |
| `DELETE` | `/api/v1/account` | Bearer access JWT | Revoke tokens + cascade hard-delete |

## Export (minimization)

Includes: account metadata (email + status), profiles, devices (`pushTokenConfigured` only), sources (`toSourcePublicView`), favorites, playback states.

**Never included:** password hash, access/refresh tokens, push tokens, source credential ciphertext (`credentialsEncrypted` / `encKeyId`), encrypted URIs.

## Deletion

1. Verify access JWT.
2. Deny-list current `jti` + set account epoch (`jwt:acct-epoch:{accountId}`).
3. Revoke all refresh tokens with reason `account_deleted`.
4. Hard-delete favorites, playback, sync log, sources, devices, profiles, refresh rows, then the account.

Postgres schema already cascades from `app.accounts` (profiles, devices, sources, sync_events, favorites via profiles, refresh_tokens via BE-012). Sprint 0 uses in-memory `deleteByAccount` on each port.
