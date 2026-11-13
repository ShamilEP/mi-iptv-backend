# SEC-011: JWT hardening review

- **Status:** Accepted (Sprint 0)
- **Refs:** Security §2.2; ADR-004 / PRD-021; BE-023
- **Task:** SEC-011
- **Date:** 2026-11-13

## Goal

Review access JWT hardening: **pin RS256** (reject `none` / alg confusion), **validate `iss` / `aud` / `exp`**, **rotate keys via `kid`**, and manage **RS256** keys per PRD-021 / ADR-004.

## Findings

### 1. Algorithm pin — Pass

| Control | Evidence |
| --- | --- |
| Issue only RS256 | Header `alg: REQUIRED_ACCESS_TOKEN_ALG` (`RS256`) in `NodeRs256AccessTokenService` |
| Verify rejects others | `assertJwtAccessAlg` before crypto — rejects `none`, `HS256`, missing alg |
| No JWT SDK | Node `crypto` `createSign` / `createVerify` with `RSA-SHA256` only |
| HS256 not used | ADR-004; PRD-021 chose RS256 for MVP |

### 2. Claim validation (`iss` / `aud` / `exp`) — Pass (hardened this task)

| Claim | Issue | Verify |
| --- | --- | --- |
| `iss` | `JWT_ISSUER` (default `mi-iptv`) | `assertJwtIssuer` exact match |
| `aud` | `JWT_AUDIENCE` (default `mi-iptv-api`) | `assertJwtAudience` (string or array containing expected) |
| `exp` | `iat + accessTokenTtlSeconds` | `assertAccessTokenNotExpired` via `parseAccessTokenClaims` |

**Gap closed:** Prior verify path checked `exp` and signature/`kid` but not `iss`/`aud`. SEC-011 adds audience on issue and validates both issuer and audience after signature verify.

### 3. Key rotation via `kid` — Pass

| Control | Evidence |
| --- | --- |
| Active `kid` | `JWT_KEY_ID` + PEMs via `EnvJwtSigningKeyStore` |
| Previous keys | `JWT_PREVIOUS_PUBLIC_KEYS` JSON map for verify during rotation |
| Unknown kid | `ACCESS_TOKEN_KEY_UNKNOWN` |
| Sign vs verify | New tokens use active private key; old tokens verify with previous public keys |

### 4. RS256 key management (PRD-021 / ADR-004) — Pass

| Concern | Choice in repo |
| --- | --- |
| Algorithm | **RS256** only |
| Access TTL | **3600 s** (bounds 900–3600) |
| Key material | Secret-manager injection → env (`JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `JWT_KEY_ID`) |
| Dev fallback | Ephemeral RSA keys when unset in `APP_ENV=dev` only (`main.ts`) |

## Verification checklist (DoD)

- [x] Algorithm pinned to RS256; `none` / alg confusion rejected
- [x] `iss`, `aud`, and `exp` validated on verify
- [x] Key rotation via `kid` (+ previous public keys)
- [x] RS256 key management aligned with PRD-021 / ADR-004

## Follow-ups

- Publish JWKS endpoint when multiple verifiers need public keys without env injection
- Clock skew tolerance (`nbf` / leeway) if clients observe intermittent expiry races
