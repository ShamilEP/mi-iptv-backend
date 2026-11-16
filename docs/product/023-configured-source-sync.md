# Product decision — PRD-023 configured source sync

- **Status:** Decision recorded (awaiting tracker Done)
- **Date:** 2026-11-15
- **Purpose:** Unblock BE-062 / BE-064 and align FR-033 with Backend §2.2–2.3

## Decision

| ID | Decision | ADR |
| --- | --- | --- |
| **PRD-023** | Source **deltas on `/sync/state`**; writes stay on **`/sources` CRUD**; **no credential sync** to clients | [ADR-009](../adr/009-configured-source-sync.md) |

## Spec update checklist

| Artifact | Status |
| --- | --- |
| In-repo ADR-009 + `docs/backend/prd-023-configured-source-sync.md` | Done (engineering source of truth) |
| OneDrive Backend §2.3 | **Manual** — add sources to `/sync/state`; keep writes on §2.2 |
