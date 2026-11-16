# BE-005: Cross-cutting API conventions

- **Status:** Accepted (Sprint 0)
- **Refs:** Backend §3.1; SRS §8; [ADR-011](../adr/011-api-conventions.md); ADR-005; OpenAPI `1.0.0`
- **Code:** `src/domain/api/*`, `src/shared/trace-id.ts`, `src/domain/sync/client-event-id.ts`

## Checklist (DoD)

| Convention | Rule | Artifact |
| --- | --- | --- |
| Error envelope | `{ error, code }` (+ optional `traceId` / `details`) | OpenAPI `ErrorEnvelope`; `buildErrorEnvelope` |
| Pagination | `cursor` + `limit` → `{ items, nextCursor }` | OpenAPI `CursorPage`; `parsePaginationQuery` / `buildCursorPage` |
| Versioning | Business routes under `/api/v1`; `/health` + `/realtime` excepted | ADR-011; OpenAPI paths |
| `clientEventId` | UUID; required on sync writes; replay duplicates | ADR-005; `parseClientEventId` / `replayIfDuplicate` |
| `trace_id` | Echo/generate `x-trace-id` on every HTTP response | `resolveTraceId`; `NodeHttpServer.write` |
| UTC / server clock | ISO-8601 UTC; `serverTimestamp` authoritative for LWW | `serverNowUtc` / `toServerTimestamp` |

## Defaults

| Knob | Default | Bounds |
| --- | --- | --- |
| Catalog `limit` | `50` | 1–200 |
| Search `limit` | `20` | 1–100 |
| Sync state `limit` | `500` | 1–500 |

## Gateway follow-up

**BE-006** implements routing under `/api/v1`, JWT middleware, validation, and rate-limit hooks using these conventions. Do not invent a second error or pagination shape in the gateway.
