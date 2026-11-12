# Proposed packages for BE-021 (password hashing)

**Status:** Approved and installed (human: `approve @node-rs/argon2`).

| Package | Purpose | Alternatives | Rationale |
| --- | --- | --- | --- |
| `@node-rs/argon2` | Argon2id hash + verify (PHC-encoded) behind `PasswordHasher` port | `argon2` (node-gyp native); `hash-wasm` (WASM, slower) | Prefers Argon2id (Security §2.1 / NFR-013); prebuilt N-API binaries avoid node-gyp pain on Windows + CI; TypeScript types included |

## Wiring rule

- Install only after explicit approval.
- Import **only** in `src/infrastructure/crypto/` (adapter).
- `domain` / `application` must use `PasswordHasher` port only — never `@node-rs/argon2`.

## Config (env names only)

| Env | Meaning | Default (proposed) |
| --- | --- | --- |
| `PASSWORD_ARGON2_MEMORY_KIB` | Argon2 memory (KiB) | `65536` (64 MiB) |
| `PASSWORD_ARGON2_TIME_COST` | Iterations | `3` |
| `PASSWORD_ARGON2_PARALLELISM` | Lanes | `1` |

Not using bcrypt unless Argon2 packaging is rejected; if bcrypt is chosen instead, propose `bcrypt` with **cost ≥ 12** and the same port.
