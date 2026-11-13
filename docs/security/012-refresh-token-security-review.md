# SEC-012: Refresh-token security review

- **Status:** Accepted (Sprint 0)
- **Refs:** Security §2.2; ADR-004; BE-023; BE-024; BE-025
- **Task:** SEC-012
- **Date:** 2026-11-13

## Goal

Review opaque refresh-token security: **hashed at rest**, **rotation with reuse detection**, **device binding**, **30-day expiry**, and **revoke-all**.

## Findings

### 1. Hashed at rest — Pass

| Control | Evidence |
| --- | --- |
| Storage | `app.refresh_tokens.token_hash` (`bytea UNIQUE`) — schema comment: token itself never stored |
| Algorithm | SHA-256 via `OpaqueRefreshTokenService.hash` (`node:crypto`) |
| Cleartext | Returned once on login/refresh responses; never persisted or logged (`refreshtoken` redacted) |

### 2. Rotation with reuse detection — Pass

| Control | Evidence |
| --- | --- |
| Rotation | `RefreshAuthSession` marks prior row `usedAt` / `replacedBy`, inserts new hash in same `familyId` |
| Reuse | Presenting a spent token (`usedAt !== null`) → `revokeFamily(..., 'reuse_detected')` → `AUTH_REFRESH_REUSE` |
| Concurrent race | Failed `markRotated` treated as reuse and family revoke |
| Revoked / expired | Rejected before rotation (`AUTH_REFRESH_REVOKED` / `AUTH_REFRESH_EXPIRED`) |

### 3. Device binding — Pass

| Control | Evidence |
| --- | --- |
| Issue | Requires `deviceId`; stored on refresh row + access JWT claims |
| Refresh | Rotated token keeps `existing.deviceId` (cannot retarget another device via refresh alone) |
| Schema | FK `(device_id, account_id) → app.devices`; index on active device rows |

### 4. 30-day expiry — Pass (hardened this task)

| Control | Evidence |
| --- | --- |
| Default | `REFRESH_TOKEN_TTL_DEFAULT_SECONDS = 2_592_000` (30 days) |
| Bounds | Config rejects TTL outside **1–30 days** (`JWT_REFRESH_TTL_SECONDS`) — SEC-012 |
| Enforce | Refresh path rejects `expiresAt <= now` |

Rotation issues a new 30-day window (sliding). Absolute family max lifetime can be added later if product requires a hard session cap.

### 5. Revoke-all — Pass

| Control | Evidence |
| --- | --- |
| Logout all | `LogoutAccount` with `allSessions: true` → `revokeByAccount(..., 'logout_all')` |
| Single device | `revokeByDevice(..., 'logout')` |
| Inactive account on refresh | Family revoked with `logout_all` |

## Verification checklist (DoD)

- [x] Hashed at rest (SHA-256 / `token_hash`)
- [x] Rotation with reuse detection (family revoke)
- [x] Device binding
- [x] 30-day expiry (default + max bound)
- [x] Revoke-all (account-wide logout)

## Follow-ups

- Postgres refresh-token adapter (Sprint 0 uses in-memory store)
- Optional absolute family TTL if sliding renewal is too permissive for threat model
