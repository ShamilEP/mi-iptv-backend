# Product spec alignment — PRD-021 / PRD-022 / PRD-024

- **Status:** Decisions recorded (awaiting tracker Done)
- **Date:** 2026-11-12
- **Purpose:** Unblock auth (BE-023/BE-022), sync (BE-011/BE-060), and later BE-121 integration tests

## Decisions (summary)

| ID | Decision | ADR |
| --- | --- | --- |
| **PRD-021** | Access JWT **RS256**, TTL **3600 s**; refresh **30 days** device-bound | [ADR-004](../adr/004-jwt-ttl-and-signing.md) |
| **PRD-022** | Sync writes require **`clientEventId`**; playback supports **`forceReset`**; drop authoritative **`deviceTimestamp`** (optional `clientReportedAt` only); prefer **`cursor`/`change_seq`** for delta | [ADR-005](../adr/005-sync-payload-contract.md) |
| **PRD-024** | §5.1 = core five; physical schema also includes favorites, `sync_events`, password-reset & refresh tokens; settings via profile JSON unless BE-011 adds a table | [ADR-006](../adr/006-relational-data-model-scope.md) |

## Spec update checklist

| Artifact | Status |
| --- | --- |
| In-repo ADRs 004–006 + `docs/backend/021|022|024-*.md` | Done (engineering source of truth) |
| OneDrive `Mi_IPTV_Especificacion_Backend.md` §2.1 / §2.3 / §5.1 | **Manual** — agent lacked write permission; paste from ADRs |
| OneDrive `Mi_IPTV_Especificacion_Ciberseguridad.md` §2.2 | **Manual** — set RS256 + 3600 s only |

Suggested Security §2.2 line: access token **3600 s**, **RS256** with `kid`; refresh **30 days** device-bound.  
Suggested Backend §2.3: require `clientEventId`, optional `forceReset`, replace `deviceTimestamp` with optional `clientReportedAt`, delta via `cursor`.
