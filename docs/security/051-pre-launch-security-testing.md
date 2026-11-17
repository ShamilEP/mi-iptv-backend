# SEC-051: Pre-launch security testing

- **Status:** Accepted (MVP)
- **Refs:** SRS §22; Security §2.2, §3.2, §4.1, §5; SEC-011; SEC-013; SEC-015
- **Task:** SEC-051
- **Date:** 2026-11-17

## Goal

Run **basic `/auth` security tests** (brute force, token expiry, data exposure) per SRS §22, an **authenticated DAST** pass against the live API surface, and publish a **mobile static-analysis** checklist for TV / companion clients.

## 1. Basic `/auth` testing (SRS §22)

Automated coverage: `tests/unit/pre-launch-auth-security-sec051.test.ts`.

| Control | Expected | Evidence |
| --- | --- | --- |
| Brute force | 5 failures / 15 min per IP and account → `429` `AUTH_RATE_LIMITED` + `Retry-After` | SEC-013 / BE-028 + SEC-051 HTTP lockout assertion |
| Access token expiry | Expired RS256 Bearer rejected at gateway → `401` `AUTH_ACCESS_INVALID` (no stack / secrets) | SEC-051 crafts past-`exp` JWT and calls protected route |
| Refresh token expiry | Past `expiresAt` → `401` `AUTH_REFRESH_EXPIRED` | SEC-051 inserts expired refresh row + HTTP `/auth/refresh` |
| Data exposure | Error bodies are `{ error, code }` (+ `retryAfter` on 429); never `password`, `passwordHash`, clear source credentials | SEC-051 failure + source create/list masking |

Related prior work reused (not re-litigated): SEC-011 JWT hardening, SEC-012 refresh security, SEC-013 abuse ceilings, SEC-015 IDOR/BOLA negatives, SEC-030 credential encryption, `maskSourceSecretsForApi`.

## 2. Authenticated DAST

In-process authenticated DAST harness (same SEC-051 test file + `npm run security:dast`):

1. Boot ephemeral `NodeHttpServer` + API gateway (JWT + rate limit) with auth + sources routes.
2. Register a throwaway account; capture `accessToken`.
3. Probe:
   - Unauthenticated protected routes → `401`
   - Authenticated `GET /api/v1/sources` → success without credential plaintext
   - Create Xtream source with secrets → response masks `username` / `password` / `token`
   - Expired Bearer → `401` without leaking key material
   - Login lockout path → `429` without echoing the attempted password

CI: `.github/workflows/security-scans.yml` job **dast** runs `npm run security:dast` after build (no new npm packages; Node built-ins + existing app stack only).

Optional deeper OWASP ZAP against a deployed QA host remains a follow-up for SEC-053 (external pen test), not required for this in-repo gate.

## 3. Mobile static analysis

Client binaries are **out of this repository** (`apps/android-tv` / companion may be absent; see INF-041 packaging workflows). This task ships:

| Artifact | Role |
| --- | --- |
| `docs/security/051-mobile-static-analysis-checklist.md` | Controls from Security §3.2 + Logcat/Keystore bans (SEC-003) |
| `.github/workflows/mobile-static-analysis.yml` | Runs Android Lint / Flutter analyze when client trees are present; skips cleanly when absent |

Execution of MobSF / full APK-IPA SAST on release artifacts is owned by TV/Companion CI once packages exist; the checklist is the acceptance bar.

## Verification checklist (DoD)

- [x] Basic `/auth` brute-force testing
- [x] Basic `/auth` token expiry testing (access + refresh)
- [x] Basic `/auth` data-exposure testing
- [x] Authenticated DAST scan (in-process + CI `security:dast`)
- [x] Mobile static analysis checklist + conditional CI workflow

## Follow-ups

- Wire MobSF (or equivalent) into TV/Companion release pipelines when APK/IPA artifacts are produced
- Optional ZAP API scan against QA with auth context before SEC-053
- Extend DAST probe list as new authenticated routes ship (catalog, diagnostics)
