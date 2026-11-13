# SEC-010: Password storage and policy review

- **Status:** Accepted (Sprint 0)
- **Refs:** Security §2.1; BE-021; BE-120; SEC-003
- **Task:** SEC-010
- **Date:** 2026-11-13

## Goal

Review account password storage against Security §2.1: **Argon2id** (or bcrypt cost ≥ 12), complexity policy (**≥8 chars, ≥1 number, ≥1 special**), and **no plaintext** in persistence, logs, or API responses.

## Findings

### 1. Algorithm and cost — Pass

| Requirement | Evidence |
| --- | --- |
| Argon2id preferred (or bcrypt cost ≥ 12) | `Argon2PasswordHasher` uses `Algorithm.Argon2id` only (`src/infrastructure/crypto/argon2-password-hasher.ts`) |
| Cost floors | Defaults `m=65536 KiB`, `t=3`, `p=1`; loader rejects `m < 19456`, `t < 2`, `p < 1` (`src/config/password-hashing.ts`) |
| bcrypt ≥ 12 | N/A — Argon2id is the mandatory path; bcrypt is not implemented (aligned with §2.1 “Argon2id or bcrypt”) |

OWASP-aligned Argon2id parameters meet or exceed the spirit of “bcrypt cost ≥ 12” for MVP interactive login.

### 2. Password policy — Pass

| Rule | Implementation |
| --- | --- |
| ≥ 8 characters | `PASSWORD_MIN_LENGTH = 8` |
| ≥ 1 digit | `/\d/` |
| ≥ 1 special | `/[^A-Za-z0-9]/` |

Domain helpers: `isPasswordPolicyCompliant` / `assertPasswordMeetsPolicy` (`src/domain/auth/password-policy.ts`).

**Hardening (this task):** `Argon2PasswordHasher.hash` calls `assertPasswordMeetsPolicy` before hashing so register/reset paths cannot persist a non-compliant password even if a use case forgets the check. `verify` does not re-apply complexity (existing hashes / login attempts).

### 3. No plaintext anywhere — Pass

| Surface | Status |
| --- | --- |
| Database | `app.accounts.password_hash` stores PHC text only (`001_postgres_schema.sql`) |
| Seeds | DEV/QA seeds use `$argon2id$…` placeholders — not login plaintext |
| Domain model | `Account.passwordHash` only; no `password` field |
| Login | Plaintext exists only as request/use-case argument for `verify`; never written to repo |
| API responses | Auth routes return tokens/errors; no `password` / `passwordHash` in presentation auth DTOs |
| Logs | SEC-003 redacts `password`, `passwordhash`, and compound `*password*` keys |

IPTV **source** passwords are separate: AES-256-GCM ciphertext at rest and masked (`password: null`) in API views — out of scope for account §2.1 but consistent with “no clear secrets in API”.

## Gaps / follow-ups

- Account **register** / **password-reset** use cases (BE-020+) must still call hashing via `PasswordHasher` (policy now enforced inside `hash`).
- Seed placeholder PHC strings are intentionally non-loginable; replace with real Argon2id hashes only in controlled test fixtures that meet policy.

## Verification checklist (DoD)

- [x] Argon2id with cost floors (bcrypt ≥ 12 alternative not used)
- [x] Policy ≥8 / digit / special verified and enforced on hash
- [x] No plaintext password storage in schema, seeds, domain, API, or logs
