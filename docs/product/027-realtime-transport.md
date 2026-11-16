# Product decision — PRD-027 realtime transport

- **Status:** Decision recorded (awaiting tracker Done)
- **Date:** 2026-11-15
- **Purpose:** Unblock BE-077 realtime gateway and align Backend §1 / FR-036

## Decision

| ID | Decision | ADR |
| --- | --- | --- |
| **PRD-027** | **WebSocket (WSS) primary** + **FCM/APNs push fallback** when no socket; SSE not used for MVP | [ADR-007](../adr/007-realtime-transport.md) |

## Spec update checklist

| Artifact | Status |
| --- | --- |
| In-repo ADR-007 + `docs/backend/027-realtime-transport.md` | Done (engineering source of truth) |
| OneDrive Backend §1 / FR-036 wording | **Manual** — replace “WebSocket / SSE / push” with WSS primary + push fallback |

Suggested Backend §1 line: companion↔TV realtime uses **authenticated WebSocket**; **FCM/APNs** only when the target has no open socket.
