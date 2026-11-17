# BE-077: Realtime gateway (authenticated WSS)

- **Status:** Implemented (MVP)
- **Refs:** FR-036; Backend §1; ADR-007; PRD-027; INF-022; BE-081
- **Code:** `NodeRealtimeGateway`, `AuthenticateRealtimeHandshake`, presence + device bus

## DoD

| Item | Behavior |
| --- | --- |
| Authenticated WSS | `GET /realtime` upgrade; Bearer (preferred) or `access_token` query; `deviceId` must match JWT claim |
| Per-device channels | Redis Pub/Sub `dev:{deviceId}` (BE-078); clients may publish `event` only to their channel |
| Heartbeat | JSON `{type:"heartbeat"}` or WS ping/pong refreshes `presence:{deviceId}` (~45s TTL) |
| Reconnect/resume | `resumeToken` query restores `sessionId` within resume TTL |
| Connection limits | Defaults: 2 / device, 20 / account → HTTP 429 |

## Transport

Node built-in HTTP `upgrade` + RFC6455 framing (no third-party `ws` package). Cross-node fan-out is Redis Pub/Sub via `RedisRealtimeDeviceBus` (BE-078).
