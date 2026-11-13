# SEC-013: Login and registration abuse controls

- **Status:** Accepted (Sprint 0)
- **Refs:** Security §4.1; US-01; BE-028; BE-020
- **Task:** SEC-013
- **Date:** 2026-11-13

## Goal

Verify **5 attempts / 15 minutes per IP and per account** on login (429), and **rate-limit `/auth/register`**. US-01 requires a clear “email already exists” conflict (enumeration), so registration must be throttled.

## Findings

### 1. Login 5 / 15 min per IP and per account — Pass

| Control | Evidence |
| --- | --- |
| Limits | `LOGIN_BRUTE_FORCE_MAX_FAILURES = 5`, `LOGIN_BRUTE_FORCE_WINDOW_SECONDS = 900` |
| Keys | `rl:login:ip:{ip}`, `rl:login:acct:{sha256(email)}` (INF-022) |
| Behavior | Failures bump counters; at max → `AuthRateLimitError` → HTTP **429** + `Retry-After` |
| Success | `clearFailures` deletes both keys |
| Tests | `tests/unit/login-brute-force.test.ts` (BE-028) |

### 2. Register rate-limit — Pass (gap closed this task)

| Control | Evidence |
| --- | --- |
| Limits | `REGISTER_ABUSE_MAX_ATTEMPTS = 5`, `REGISTER_ABUSE_WINDOW_SECONDS = 900` |
| Keys | `rl:register:ip:{ip}`, `rl:register:acct:{sha256(email)}` |
| Behavior | Counts **every** attempt after required fields (success, conflict, validation) — throttles enumeration via `AUTH_EMAIL_CONFLICT` |
| HTTP | Same `AuthRateLimitError` → **429** mapping as login |
| Wiring | `RegisterAbuseGuard` → `RegisterAccount` → `clientIp` from route |

Login and register use **separate** Redis key namespaces so a login lockout does not block signup (and vice versa).

### 3. US-01 enumeration mitigation — Pass (throttled)

| Control | Evidence |
| --- | --- |
| Conflict | Register still returns **409** `AUTH_EMAIL_CONFLICT` (US-01) |
| Mitigation | Per-IP and per-email register ceilings blunt bulk probing |

## Verification checklist (DoD)

- [x] Login: 5 attempts / 15 min per IP and per account → 429
- [x] Register: rate-limited (5 / 15 min per IP and per email) → 429
- [x] Enumeration via “email already exists” mitigated with throttling

## Follow-ups

- Optional CAPTCHA / proof-of-work after repeated 429s (product)
- Shared edge rate limits (WAF / API gateway) in addition to app Redis counters
