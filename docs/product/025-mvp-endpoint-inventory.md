# Product decision — PRD-025 MVP endpoint list

- **Status:** Decision recorded (awaiting tracker Done)
- **Date:** 2026-11-15
- **Purpose:** Unblock BE-003 OpenAPI v1 freeze

## Decision

| ID | Decision | ADR |
| --- | --- | --- |
| **PRD-025** | **Package A:** add profiles, `PATCH /sources`, content detail, reset confirm, diagnostics, `/health`, WSS handshake to Backend §2 / MVP OpenAPI; **defer EPG** to Release 1 | [ADR-010](../adr/010-mvp-endpoint-inventory.md) |

## Spec update checklist

| Artifact | Status |
| --- | --- |
| In-repo ADR-010 + `docs/backend/025-mvp-endpoint-inventory.md` | Done (engineering source of truth) |
| OneDrive Backend §2 | **Manual** — merge Package A paths; mark EPG as R1 |
