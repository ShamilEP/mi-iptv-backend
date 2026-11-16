# ADR-011: Cross-cutting API conventions

- **Status:** Accepted
- **Date:** 2026-11-16
- **Deciders:** Backend (BE-005)
- **Refs:** Backend §3.1; SRS §8; ADR-005; OpenAPI MVP v1.0.0; BE-006

## Context

TV, companion, QA, and BE-006 (gateway/BFF) need one shared contract for errors, pagination, versioning, sync idempotency, tracing, and time. Pieces already exist in code (e.g. `{ error, code }`, `x-trace-id`, cursor pages, `clientEventId`), but they were not frozen as cross-cutting rules.

## Decision

### 1. Versioning

- Business HTTP routes live under **`/api/v1/...`**.
- Exceptions outside the version prefix: **`GET /health`** (ALB probe), **`GET /realtime`** (WSS upgrade).
- Breaking changes require a new major prefix (`/api/v2`). Additive fields and new optional query params are allowed within v1.

### 2. Error envelope

Every non-2xx JSON error body uses:

| Field | Required | Notes |
| --- | --- | --- |
| `error` | yes | Human-readable message (no secrets) |
| `code` | yes | Stable machine code (`AUTH_EMAIL_CONFLICT`, `SYNC_PAYLOAD_INVALID`, …) |
| `traceId` | no | Same value as response header `x-trace-id` when present in body |
| `details` | no | Safe structured hints (validation paths, limits); never passwords/tokens |

Specializations (e.g. `retryAfter` for rate limits) **extend** this envelope; they do not replace `error`/`code`.

### 3. Pagination

List endpoints that can grow beyond a single response use **cursor pagination**:

- Query: `cursor` (opaque string, omit/empty = start), `limit` (bounded integer; default documented per resource).
- Response: `{ "items": [...], "nextCursor": string | null }` — `null` means no further page.
- Do **not** use offset/page-number pagination for MVP catalog/sync lists.
- Sync delta pull uses numeric `change_seq` as cursor (`GET /sync/state`) per ADR-005 / ADR-009.

### 4. `clientEventId` idempotency (Backend §3.1)

- Required on sync **write** endpoints (`playback-state`, `favorites`, `settings`, batched `events`).
- Must be a UUID; clients reuse the same id on network retries.
- Server stores the first outcome and **replays** it on duplicate `(accountId, clientEventId)` without re-applying the write (see `replayIfDuplicate` / ADR-005).

### 5. `trace_id` propagation

- Clients **MAY** send `x-trace-id`.
- Server **MUST** respond with `x-trace-id` (echo or generate UUID).
- Logs bind `trace_id` (and `account_id` when known). Never log tokens or source passwords.

### 6. UTC timestamps / server clock

- All JSON date-times use **UTC** ISO-8601 (`format: date-time`).
- Sync conflict / LWW uses **server arrival time** and DB `updated_at` / `change_seq` — never client wall clocks.
- Responses that acknowledge writes expose **`serverTimestamp`** (UTC). Optional `clientReportedAt` is informational only (ADR-005).

## Consequences

- OpenAPI components document the shared shapes (`ErrorEnvelope`, pagination).
- Domain helpers under `src/domain/api/` encode parse/build rules for pagination, envelopes, and server timestamps.
- **BE-006** wires gateway middleware (auth, validation, rate-limit) against these conventions; route handlers migrate to shared helpers over time.
