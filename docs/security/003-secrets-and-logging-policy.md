# SEC-003: Secrets and logging policy

- **Status:** Accepted (Sprint 0)
- **Refs:** Security §3.2, §5; INF-013; INF-023; INF-044; workspace `security-secrets` rule
- **Task:** SEC-003
- **Date:** 2026-11-11

## Goal

Ensure **no secrets in the repository**, **secret scanning in CI**, and that **tokens, passwords, and IPTV source credentials are never logged** (backend JSON logs, Android Logcat, crash reports), with explicit **log redaction rules**.

## 1. No secrets in the repo

| Rule | Enforcement |
| --- | --- |
| Never commit credentials, tokens, private keys, DEKs, or ciphertext keys | Human review + Gitleaks (INF-044) |
| Never commit `.env` / `.env.*` with real values | `.gitignore` ignores `.env`, `.env.*`; only `.env.example` allowed |
| `.env.example` documents **names** and placeholders only | Reviewers reject real-looking material |
| KMS key **ids/ARNs** may appear as mocks/docs; key **material** never in git | INF-013 / INF-023 |
| Source credentials at rest are AES-256-GCM ciphertext only (DB) | Security §5; cleartext never stored |

Forbidden in git (non-exhaustive): `*.pem`, `*.key`, `secrets/`, `credentials*.json`, JWT private key PEM bodies, `SOURCE_CREDENTIALS_DATA_KEY` values, live `DATABASE_URL` / `REDIS_URL` with passwords.

## 2. Secret scanning in CI

| Control | Location |
| --- | --- |
| Gitleaks full-history scan | `.github/workflows/security-scans.yml` (INF-044) |
| Config / allowlist | `.gitleaks.toml` (allows `.env.example` **paths** only) |
| Dependency / image / SAST | Same workflow (defense in depth; not a substitute for Gitleaks) |

PRs and pushes to `main` / `develop` must keep the **secrets** job green. Do not add broad Gitleaks allowlists for secret-like strings.

## 3. Never log secrets (all surfaces)

### 3.1 Backend (this repository)

| Never log (raw) | Examples |
| --- | --- |
| Passwords | Account password, Xtream password |
| Tokens | Access JWT, refresh token, pairing codes |
| Source credentials | M3U basic-auth, Xtream user/pass, proprietary tokens |
| Key material | `JWT_PRIVATE_KEY`, `SOURCE_CREDENTIALS_DATA_KEY`, KMS plaintext |
| Connection secrets | Password segment of `DATABASE_URL` / `REDIS_URL` |

Allowed: secret **presence** flags (`secretsLoaded.databaseUrl: true`), KMS **key id/alias**, env name (`APP_ENV`), non-secret ids (`account_id`, `device_id`, `trace_id`).

Implementation: `JsonConsoleLogger` runs fields through `redactLogFields` before emit (`src/infrastructure/logging/`).

### 3.2 Android TV Logcat (Security §3.2)

- Do **not** write JWT, refresh tokens, source passwords, or DEKs to `Log` / `Logcat`.
- Prefer structured logs without sensitive keys; strip `Authorization` and credential fields at the logging facade.
- Debug builds must obey the same ban (no `#ifdef DEBUG` exceptions for secrets).

### 3.3 Companion (iOS / Android)

- Same ban as TV for Keychain/Keystore material and session tokens.
- Crash / analytics SDKs: disable automatic logging of network bodies and breadcrumbs that may contain credentials.

### 3.4 Crash reports / QoE (Security §6)

- Crash and QoE payloads must use anonymous session/device identifiers.
- Scrub request headers, cookies, and form bodies of tokens/passwords before upload.
- Never attach `.env`, keystore dumps, or source-credential plaintext to crash tickets.

## 4. Log redaction rules (backend)

Applied recursively to structured log **fields** (and string values that look like URLs with userinfo):

| Match | Action |
| --- | --- |
| Field name (case-insensitive) in sensitive denylist | Replace value with `[REDACTED]` |
| Nested objects / arrays | Redact depth-first |
| String matching `scheme://user:password@host` | Replace userinfo with `***:***@` |

Sensitive name patterns (denylist):  
`password`, `passwd`, `secret`, `token`, `accessToken`, `refreshToken`, `authorization`, `apiKey`, `privateKey`, `credential`, `credentials`, `sourcePassword`, `sourceCredentials`, `dataKey`, `jwt`, `cookie`, `set-cookie`, plus exact env-style names `DATABASE_URL`, `REDIS_URL`, `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `SOURCE_CREDENTIALS_DATA_KEY`.

Message text should not interpolate secrets. Prefer logging ids and outcomes only.

## 5. API / storage reminder (Security §5)

- API responses must **never** return clear source passwords/tokens (mask on GET).
- Encryption keys managed via KMS; never hardcoded.

## Verification checklist (DoD)

- [x] No-secrets-in-repo policy + `.gitignore` / `.env.example` posture
- [x] Secret scanning in CI (INF-044 Gitleaks, documented here)
- [x] Never-log policy for tokens / passwords / source credentials (backend + Logcat + crash)
- [x] Log redaction rules defined and enforced in backend logger

## Follow-ups

- Client teams: mirror denylist in TV/Companion logging facades.
- Crash SDK config: **INF-054** (`docs/infra/054-crash-reporting.md`) — Firebase Crashlytics with anonymous ids + scrubbing.
- Expand denylist when new secret field names appear in use cases.
