# Product decision — PRD-026 send-to-TV semantics

- **Status:** Decision recorded (awaiting tracker Done)
- **Date:** 2026-11-15
- **Purpose:** Unblock BE-080 and align Backend §2.4 / FR-037

## Decision

| ID | Decision | ADR |
| --- | --- | --- |
| **PRD-026** | Path `{id}` = **sender**; body `targetDeviceId` = **TV**; target always required; offline → queue; TTL **5 min** | [ADR-008](../adr/008-send-to-tv-semantics.md) |

## Spec update checklist

| Artifact | Status |
| --- | --- |
| In-repo ADR-008 + `docs/backend/026-send-to-tv-semantics.md` | Done (engineering source of truth) |
| OneDrive Backend §2.4 | **Manual** — clarify sender vs target, multi-TV, offline queue, 5 min expiry |
