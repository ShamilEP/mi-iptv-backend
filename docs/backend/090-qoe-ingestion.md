# BE-090: POST /diagnostics/qoe ingestion

- **Status:** Implemented (awaiting review)
- **Refs:** FR-029; Infra §4.2; SEC-040; ADR-010; BE-006
- **Task:** BE-090

## Goal

Accept batched QoE samples so dashboards can track TTFF, rebuffers, and stream
errors by source provider — with anonymous session ids only.

## Endpoint

| Method | Path | Auth | Status |
| --- | --- | --- | --- |
| `POST` | `/api/v1/diagnostics/qoe` | JWT (gateway default) | `202` |

### Body (`IngestQoeRequest`)

| Field | Required | Notes |
| --- | --- | --- |
| `anonymousSessionId` | yes | UUID (maps to `telemetry.qoe_events.session_id`) |
| `events` | yes | 1–100 `QoeEvent` items |
| `telemetryOptIn` | no | default `true`; `false` → no-op `{ accepted: 0, skippedOptOut: true }` |
| `appVersion` | no | batch-level |
| `deviceModel` | no | batch-level |

### `QoeEvent`

| Field | Required |
| --- | --- |
| `sourceProvider` | yes |
| `timeToFirstFrameMs` | no (≥ 0) |
| `rebufferEventsCount` | no (≥ 0) |
| `rebufferDurationMs` | no (≥ 0) |
| `streamErrorsCount` | no (≥ 0) |

Unknown properties rejected. Infra snake_case names map to these camelCase fields.

## Privacy

- Persist/log **only** anonymous session id + metrics + optional app/device labels
- **Never** store `accountId`, email, push tokens, or source credentials
- JWT authenticates the caller for abuse control / rate limits; account id is not written

## Persistence

Sprint 0: `InMemoryQoeEventRepository`. Postgres `telemetry.qoe_events` adapter is follow-up (insert-only role already in schema).

## Out of scope

- Hourly rollup / Grafana (BE-091)
- Telemetry opt-out preference sync surface beyond request flag (BE-093)
- `GET /diagnostics/network` (BE-092)
