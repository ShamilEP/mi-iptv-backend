# BE-076: Track device presence

- **Status:** Implemented (awaiting review)
- **Refs:** US-08; BE-075; BE-077; BE-078; BE-081; ADR-007
- **Task:** BE-076

## Goal

Expose online/offline state for TVs and companions so clients can show
“connected”, driven by realtime socket presence — not HTTP `lastSeenAt`.

## Rules

| Concept | Source of truth |
| --- | --- |
| `connectionStatus` | WSS presence (`presence:{deviceId}` ~45s TTL via BE-077) |
| `lastSeenAt` | HTTP register / heartbeat only (coarse; never implies online) |

- `online` = open realtime socket with unexpired presence TTL
- HTTP heartbeat does **not** refresh socket presence
- Secrets / push tokens are never included in presence events or list DTOs

## Client surfaces

### `GET /api/v1/devices` (and register / heartbeat responses)

`DevicePublic` includes:

```json
{ "connectionStatus": "online" | "offline" }
```

### Realtime peer event

On WSS connect / disconnect, peers receive on `dev:{peerId}`:

```json
{
  "type": "event",
  "channel": "dev:{peerId}",
  "payload": {
    "type": "device_presence",
    "subjectDeviceId": "{uuid}",
    "connectionStatus": "online" | "offline",
    "serverTimestamp": "..."
  }
}
```

### Companion push (TV only)

When the **subject device is a TV**, `AnnounceDevicePresence` also runs BE-081
push fallback (`connected` / `disconnected`) for companions without an open
socket.

## Code map

| Layer | Piece |
| --- | --- |
| Domain | `device-connection-status.ts`, `device-presence-event.ts` |
| Application | `ListDevices` + presence; `AnnounceDevicePresence` |
| Infrastructure | `getConnectionStatuses` on Redis / in-memory adapters |
| Presentation | `NodeRealtimeGateway` announces after connect / disconnect |

## Out of scope

- Persisting presence rows to Postgres
- Inferring online from `lastSeenAt`
- Account-level Pub/Sub channel (`acc:{accountId}`)
