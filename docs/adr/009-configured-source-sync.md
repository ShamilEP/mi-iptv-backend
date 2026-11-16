# ADR-009: Configured source sync (FR-033)

- **Status:** Accepted
- **Date:** 2026-11-15
- **Deciders:** Product (PRD-023)
- **Refs:** FR-033; Backend §2.2–2.3; ADR-005; BE-040; BE-062; BE-064; `app.sync_delta`

## Context

FR-033 requires configured sources to sync across an account’s devices. Backend §2.3 documents `/sync` for playback and favorites only, while §2.2 covers `/sources` CRUD. It was unclear whether source deltas belong on `/sync/state` or only on `/sources`.

The schema already allocates `change_seq` on `user_sources` and projects a **secret-free** `source` row in `app.sync_delta`.

## Decision

| Concern | Choice |
| --- | --- |
| Delta pull | Sources are included in **`GET /sync/state?cursor=`** alongside `playback_state` and `favorite` (`entity: "source"`) |
| Full list | **`GET /sources`** remains the full registry list (CRUD surface); not a substitute for cursor deltas |
| Mutations | **Only `/sources` CRUD** (POST / PATCH / DELETE). Each successful write bumps account `change_seq` so peers observe the change on `/sync/state` |
| Offline sync writes | **No** `POST /sync/sources` and **no** `entity: "source"` in `POST /sync/events` for MVP |
| Credentials | **Never** in sync deltas or list responses (masked / omitted). Ciphertext stays server-side; other devices get metadata only |

### Delta payload (non-secret)

At minimum: `id`, `kind`, `name`, `uriRef`, `priority`, `enabled`, `status`, `statusReason`, `itemCount`, `lastIngestedAt`, `syncVersion` — matching `app.sync_delta` (no `credentials_*` / ciphertext columns).

### Tombstones

Soft-deleted sources appear in the delta with `deleted: true` (same pattern as favorites). Cursor below `tombstone_floor` → full resync required (ADR-005).

## Consequences

- Backend §2.3 must list **sources** in `/sync/state` results; §2.2 remains the write API.
- **BE-062** returns playback + favorites + sources (cursor pagination, tombstones).
- **BE-064** applies this decision: replicate metadata across devices without exposing secrets; wire CRUD → `change_seq`.
- Unblocks OpenAPI coverage of source sync in **BE-003** (with other PRDs).

## Rejected for MVP

- Source deltas only via `GET /sources` (no cursor stream) — breaks unified offline-first pull.
- Separate `/sources/delta` — duplicates `/sync/state`.
- Sync-outbox writes for sources (`/sync/events` / `/sync/sources`) — credentials and SSRF validation belong on the CRUD path.
- Syncing encrypted credential blobs to clients.
