# BE-080: POST /devices/{id}/send-to-tv

- **Status:** Implemented (MVP)
- **Refs:** FR-037; Backend §2.4; ADR-008 / PRD-026; BE-078
- **Code:** `SendToTv`, `FlushPendingDeviceCommands`, `device_commands` port

## Contract

```http
POST /api/v1/devices/{senderDeviceId}/send-to-tv
```

```json
{
  "targetDeviceId": "uuid",
  "contentId": "string",
  "sourceId": "uuid",
  "action": "play"
}
```

**202** `{ commandId, status: "queued"|"delivered", expiresAt }`

## Rules (ADR-008)

| Rule | Behavior |
| --- | --- |
| Path `{id}` | Sender; must equal JWT `deviceId` |
| `targetDeviceId` | Required TV on same account (no multi-TV auto-pick) |
| Online TV | Fan-out on `dev:{target}` → `delivered` |
| Offline TV | Persist `queued` (TTL **5 min**); push wake when token present |
| Reconnect | Gateway flushes pending `queued` commands after WSS hello |

## Rejects

- Sender ≠ JWT device → **403** `SEND_TO_TV_SENDER_MISMATCH`
- Missing target / wrong account → **404** `DEVICE_NOT_FOUND`
- Target not TV → **400** `SEND_TO_TV_TARGET_NOT_TV`
- `action` ≠ `play` / missing fields → **400**
