# ADR-008: Send-to-TV semantics

- **Status:** Accepted
- **Date:** 2026-11-15
- **Deciders:** Product (PRD-026)
- **Refs:** Backend §2.4; FR-037; BE-080; ADR-007; `app.device_commands`

## Context

`POST /devices/{id}/send-to-tv` includes both a path `{id}` and a body `targetDeviceId`, without defining which is the sender, which is the target, multi-TV behavior, offline handling, or queue expiry. BE-080 cannot ship until those rules are fixed.

D-pad / keyboard / transport stay fire-and-forget on WSS (ADR-007). Only **`play`** (send-to-TV) is persisted in `app.device_commands`.

## Decision

| Concern | Choice |
| --- | --- |
| Path `{id}` | **Sender** — the authenticated companion (or other calling device) issuing the command |
| Body `targetDeviceId` | **Target TV** — must belong to the same account; must be a TV device |
| Several TVs | Caller **must** supply `targetDeviceId`; no default / last-used / “only online TV” inference |
| Target online | Deliver over WSS (`dev:{targetDeviceId}`); mark command `delivered` / `acked` per gateway flow |
| Target offline | **Accept** the request; **queue** `play` in `device_commands`; deliver on reconnect; wake via FCM/APNs when no socket (ADR-007) |
| Queue TTL | **`expires_at` = created_at + 5 minutes**; then status `expired` |
| AuthZ | Sender and target must share `account_id` with the JWT (IDOR guard; schema FKs) |

### Contract shape

```http
POST /api/v1/devices/{senderDeviceId}/send-to-tv
```

```json
{
  "targetDeviceId": "uuid",
  "contentId": "string",
  "sourceId": "string",
  "action": "play"
}
```

Reject when: sender ≠ authenticated device (or not on account), target missing / not TV / wrong account, `action` ≠ `play`, or required fields absent. Do **not** reject solely because the TV is offline.

## Consequences

- Backend §2.4 must state: path = sender, body = target TV; explicit target required; offline → queue 5 min.
- Schema default for `device_commands.expires_at` is **5 minutes** (was provisional 10).
- Unblocks **BE-080** (depends on PRD-026 + BE-078).

## Rejected for MVP

- Path `{id}` as target TV with redundant or omitted `targetDeviceId`.
- Auto-select among multiple TVs (or “the only online TV”).
- Reject-when-offline with no queue.
- 10- or 30-minute command TTL for MVP.
