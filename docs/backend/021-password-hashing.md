# BE-021: Password hashing (Argon2id)

- **Status:** Accepted (Sprint 0)
- **Refs:** NFR-013; Security §2.1; BE-020 (register/login consumers)
- **Task:** BE-021
- **Date:** 2026-11-12

## Goal

Provide a **PasswordHasher** port with configurable Argon2id cost parameters. Never store or log plaintext passwords; persist only PHC-encoded hashes in `app.accounts.password_hash`.

## Design

| Concern | Choice |
| --- | --- |
| Algorithm | Argon2id (preferred over bcrypt per Security §2.1) |
| Encoding | Standard PHC string (includes salt + params) |
| Port | `PasswordHasher.hash` / `PasswordHasher.verify` |
| Adapter | `Argon2PasswordHasher` → `@node-rs/argon2` (approved) |
| Config | `PASSWORD_ARGON2_*` env names; loaded via `loadPasswordHashParams` |

## Security invariants

1. Plaintext passwords exist only as method arguments — never written to logs, metrics, or DB.
2. `password_hash` / PHC strings are redacted by SEC-003 log rules when present in structured fields.
3. Verify is constant-time at the library layer; application returns boolean only.
4. Cost parameters are configurable per environment without code changes.

## Verification checklist (DoD)

- [x] Argon2id via approved `@node-rs/argon2` adapter
- [x] Configurable cost parameters (`PASSWORD_ARGON2_*`)
- [x] Port + docs; never-log / never-store-plaintext policy documented
- [x] Unit tests against real Argon2id adapter
