# BE-023: JWT issuance and key management

- **Status:** Implemented (awaiting review)
- **Refs:** Security §2.2; NFR-013; ADR-004 / PRD-021; INF-013
- **Task:** BE-023
- **Date:** 2026-11-12

## Goal

Issue **RS256** access JWTs (accountId, deviceId, roles, `kid`) with **3600 s** TTL, plus **opaque refresh tokens** (30 days, device-bound, SHA-256 hashed for storage), with signing keys from the secret manager and rotation via `kid`.

## Design

| Piece | Location |
| --- | --- |
| Access JWT (RS256) | `NodeRs256AccessTokenService` (`node:crypto`) |
| Opaque refresh | `OpaqueRefreshTokenService` |
| Key store + rotation | `EnvJwtSigningKeyStore` |
| Use case | `IssueAuthTokenPair` |
| TTLs | `loadJwtTokenTtlConfig` |

No third-party JWT package: Node built-ins only. Optional future wrapper: propose `jose` if JWKS export / edge verification needs grow.

## Env (names only)

| Name | Purpose |
| --- | --- |
| `JWT_PRIVATE_KEY` | Active RSA private PEM (secret manager → env) |
| `JWT_PUBLIC_KEY` | Active RSA public PEM |
| `JWT_KEY_ID` | Active `kid` |
| `JWT_PREVIOUS_PUBLIC_KEYS` | Optional JSON `{ "old-kid": "<pem>" }` for verify during rotation |
| `JWT_ACCESS_TTL_SECONDS` | Default `3600` (bounds 900–3600) |
| `JWT_REFRESH_TTL_SECONDS` | Default `2592000` (30 days); bounded **1–30 days** (SEC-012) |
| `JWT_ISSUER` | Default `mi-iptv` |
| `JWT_AUDIENCE` | Default `mi-iptv-api` |

Outside `APP_ENV=dev`, missing JWT key trio fails closed at startup. In `dev`, ephemeral RSA keys may be generated for local boot.

## Access claims

Header: `{ alg: "RS256", typ: "JWT", kid }`  
Payload: `iss`, `aud`, `sub`/`accountId`, `deviceId`, `roles[]`, `jti`, `iat`, `exp`

Hardening review (alg pin, iss/aud/exp, kid rotation): **SEC-011** (`docs/security/011-jwt-hardening-review.md`).

Refresh cleartext is returned **once** to the client; persist only `tokenHash` (+ `deviceId`, `familyId`, expiry) in `app.refresh_tokens` (login/refresh use cases).

## Out of scope

- HTTP `/auth/login` wiring (**BE-022**)
- Redis JWT deny-list (**BE-028** / later)
- Persisting refresh rows (repository adapter)
