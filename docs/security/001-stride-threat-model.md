# SEC-001: STRIDE threat model (MVP)

- **Status:** Accepted (Sprint 0)
- **Refs:** Security §1–§6; SRS §8, §21; OpenAPI MVP v1.0.0 (BE-003); ADR-005/007/008/010
- **Task:** SEC-001
- **Date:** 2026-11-16

## Goal

Run a **STRIDE** threat model over MVP trust boundaries for **auth**, **sync**, **realtime / remote control**, **source ingestion**, and the **QoE** endpoint; produce **prioritized mitigations** that map onto this project’s backlog.

## Scope and trust boundaries

| Boundary | Assets | Trust |
| --- | --- | --- |
| Clients (Android TV, Companion) | Session tokens, pairing state, local source metadata | Untrusted until JWT validated |
| Public API `/api/v1` + WSS `/realtime` | Account identity, sync state, device commands | Authenticated; TLS required (SEC-020) |
| Source fetch egress | Third-party M3U/Xtream/XMLTV hosts | Untrusted; SSRF-hostile |
| Data plane (Postgres / Redis) | Password hashes, encrypted source secrets, sync rows, deny-lists | Trusted after IAM/KMS controls |
| Observability | Logs, crash, QoE | Must not hold secrets / PII beyond email-minimization rules |

Out of scope for this model: EPG Release 1 paths, proprietary partner admin APIs, physical theft of a unlocked TV (device encryption is client-owned).

### STRIDE legend

| Letter | Meaning |
| --- | --- |
| S | Spoofing |
| T | Tampering |
| R | Repudiation |
| I | Information disclosure |
| D | Denial of service |
| E | Elevation of privilege |

Priority: **P0** (block ship / Critical backlog), **P1** (MVP High), **P2** (harden / later).

---

## 1. Auth (`/api/v1/auth`, account session)

| ID | Threat | STRIDE | Priority | Mitigation | Backlog feed |
| --- | --- | --- | --- | --- | --- |
| A-01 | Credential stuffing / brute force on login | S, D | P0 | 5 fails / 15 min per IP + account → 429 | **SEC-013**, **BE-028** (done) |
| A-02 | Registration enumeration / abuse | S, D | P0 | Register rate limits; conflict codes without user enumeration beyond 409 | **SEC-013**, **BE-020** (done) |
| A-03 | Weak password storage | I, E | P0 | Argon2id (or bcrypt ≥12); never log passwords | **SEC-010**, **BE-021** (done) |
| A-04 | JWT forgery / algorithm confusion | S, E | P0 | RS256 only; reject `none`/HS*; validate iss/aud/kid/exp | **SEC-011**, **BE-023** (done) |
| A-05 | Stolen refresh token reuse | S, E | P0 | Opaque refresh, hashed at rest, rotate + reuse detection, device-bound | **SEC-012**, **BE-025** (done) |
| A-06 | Access token still valid after logout | E | P0 | Access deny-list + refresh revoke on logout; gateway must enforce deny-list | **BE-025** (done), **BE-006** |
| A-07 | Password reset token theft / fixation | S, E | P0 | Short-lived single-use reset; invalidate sessions on confirm | **BE-026**, **BE-027** (deps open) |
| A-08 | TLS strip / MITM of credentials | I, S | P0 | HTTPS/TLS 1.3 (1.2 min), HSTS, no clear HTTP API | **SEC-020** |

---

## 2. Sync (`/api/v1/sync/*`)

| ID | Threat | STRIDE | Priority | Mitigation | Backlog feed |
| --- | --- | --- | --- | --- | --- |
| Y-01 | Replay / duplicate offline writes | T, R | P0 | Required UUID `clientEventId`; ledger replay | **BE-060**, ADR-005 (done) |
| Y-02 | Client clock skew wins LWW | T | P0 | Server clock / `serverTimestamp` authoritative; ignore `deviceTimestamp` | **BE-005**, ADR-005 (done) |
| Y-03 | Cross-account sync read/write | E, I | P0 | JWT + profile ownership checks; never trust `x-account-id` alone in prod | **BE-006** (replace Sprint 0 header stand-ins) |
| Y-04 | Sync delta leaks source credentials | I | P0 | Source deltas metadata-only (no ciphertext/passwords) | **BE-062**, ADR-009 |
| Y-05 | Oversized offline batch DoS | D | P1 | Batch size limits (e.g. max 100 events) | **BE-067** (done) |
| Y-06 | Playback conflict abuse (forceReset spam) | T | P2 | Authz + rate limits; audit via SyncLog | **BE-065** (done); API rate limit in **BE-006** / Security §4.1 |

---

## 3. Realtime / remote control (WSS `/realtime`, send-to-tv, companion-status)

| ID | Threat | STRIDE | Priority | Mitigation | Backlog feed |
| --- | --- | --- | --- | --- | --- |
| R-01 | Unauthenticated socket / channel hijack | S, E | P0 | WSS only; JWT + `deviceId` binding on handshake | **BE-077**, **SEC-020**, ADR-007 |
| R-02 | Cross-device command injection (wrong TV) | E, T | P0 | Sender must match path device; target must be same account; TTL queue | **BE-080**, ADR-008 |
| R-03 | Stale offline commands after transfer | T | P1 | `device_commands` TTL 5 min; drop expired | ADR-008 / **BE-080** |
| R-04 | Connection / fan-out exhaustion | D | P1 | Per-account connection limits, heartbeat, Redis channel isolation | **BE-077** |
| R-05 | Push fallback while socket open (dup / abuse) | T, D | P1 | Presence gate: no FCM/APNs when socket present | **BE-081** (done pattern) |
| R-06 | Query `access_token` leakage in logs/proxies | I | P1 | Prefer Authorization header; redact tokens in logs | **SEC-003** (done); prefer header in **BE-077** |

---

## 4. Source ingestion (`/sources`, catalog adapters, parsers)

| ID | Threat | STRIDE | Priority | Mitigation | Backlog feed |
| --- | --- | --- | --- | --- | --- |
| S-01 | SSRF via M3U/Xtream URL (IMDS, RFC1918) | I, E | P0 | DNS/IP allow rules, redirect re-validation, no TCP/80 egress | **SEC-031**, **BE-041** (done) |
| S-02 | Clear source passwords in API/DB | I | P0 | AES-256-GCM + KMS DEK; never return clear secrets | **SEC-030**, **BE-042** (done) |
| S-03 | Parser bombs (M3U/XMLTV) | D | P0 | Isolated workers, size/time/entry caps, fuzz | **SEC-032**, **BE-044** (done patterns) |
| S-04 | Malicious playlist content XSS in clients | T, I | P1 | Sanitize titles/URLs at boundary; clients treat as untrusted text | Client TV/Companion + catalog normalize tasks (**BE-050**+) |
| S-05 | Credential exfil via sync/export | I | P0 | Export/account APIs omit source secrets | **BE-013** (done); **BE-062** |

---

## 5. QoE endpoint (`POST /api/v1/diagnostics/qoe`)

| ID | Threat | STRIDE | Priority | Mitigation | Backlog feed |
| --- | --- | --- | --- | --- | --- |
| Q-01 | QoE linked to email / account PII | I | P0 | Anonymous session id only; honor opt-out; no email in payload | **SEC-040**, Security §6; diagnostics impl task when wired |
| Q-02 | QoE as covert channel for tokens/passwords | I | P0 | Schema allow-list; reject oversized/unknown sensitive fields; never log raw bodies with secrets | **SEC-003**; OpenAPI diagnostics schemas (BE-003) |
| Q-03 | Unauthenticated flood of QoE | D | P1 | Auth or signed anonymous session + rate limit | **BE-006** rate-limit hook; diagnostics handler task |
| Q-04 | Crash/QoE breadcrumbs with source credentials | I | P0 | Scrub before upload (client + backend) | **INF-054**, **SEC-003** |

---

## Prioritized mitigation backlog (feeds tracker)

Ordered for Sprint 0 → MVP. Existing Done items stay as residual controls; open items are the actionable feed.

| Priority | Mitigation theme | Primary tasks |
| --- | --- | --- |
| P0 | Gateway enforces JWT, deny-list, validation, global rate limits | **BE-006** |
| P0 | TLS / WSS-only edge | **SEC-020** (deps INF-004/030) |
| P0 | Authenticated realtime gateway + connection limits | **BE-077** |
| P0 | Send-to-TV authz semantics | **BE-080** |
| P0 | Sync state without credential leakage + tombstones | **BE-062** |
| P0 | Password reset confirm + session invalidate | **BE-026** / **BE-027** |
| P0 | Keep SSRF / encryption / parser / auth hardening green | **SEC-031**, **SEC-030**, **SEC-032**, **SEC-010–013** (done — regression) |
| P1 | QoE anonymous enforcement when route is implemented | Diagnostics BE task + **SEC-040** rules |
| P1 | API abuse limits beyond auth (100 rpm / token) | **BE-006** + follow-up rate-limit task if split |
| P2 | Continuous threat-model refresh each epic | **SEC-002** checklist review each sprint |

## Verification checklist (DoD)

- [x] Auth covered (STRIDE table §1)
- [x] Sync covered (STRIDE table §2)
- [x] Realtime / remote control covered (STRIDE table §3)
- [x] Source ingestion covered (STRIDE table §4)
- [x] QoE endpoint covered (STRIDE table §5)
- [x] Prioritized mitigations mapped to backlog task IDs

## Review cadence

Revisit this model when OpenAPI gains new trust boundaries (e.g. EPG) or after a P0 incident. Sprint reviews use **SEC-002** acceptance criteria against the tables above.
