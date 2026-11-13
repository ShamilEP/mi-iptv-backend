# BE-065 — Sync log and conflict reporting

- **Status:** Implemented (in review)
- **Refs:** SRS §20; FR-034; Backend §3.1; ADR-005; `app.sync_events` / `app.sync_log`

## Persistence

Every sync write appends a **SyncLog** row (`entity`, `operation`, `resolvedBy`, plus idempotency fields) via `SyncLogRepository`.

Sprint 0 uses a shared in-memory ledger so `(accountId, clientEventId)` is unique across playback and favorites (matches Postgres PK).

## Client notice contract

Sync write responses include:

| Field | Meaning |
| --- | --- |
| `resolvedBy` | `accepted` \| `lww` \| `max_position` \| `force_reset` |
| `conflict` | `null` when `resolvedBy=accepted`; otherwise `{ resolved, notice: "Sync Conflict", entity, operation, resolvedBy }` |

Clients show the non-intrusive **Sync Conflict** toast when `conflict` is non-null.
