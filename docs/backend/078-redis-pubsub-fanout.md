# BE-078: Redis Pub/Sub command fan-out

- **Status:** Implemented (MVP)
- **Refs:** Backend §5.2; ADR-007; INF-022; BE-077
- **Code:** `RedisRealtimeDeviceBus`, `FanOutDeviceCommand`, `RedisClient.subscribe`

## DoD

Route remote-control commands to whichever BFF node holds the TV's socket.

## Behavior

| Step | Mechanism |
| --- | --- |
| Channel | Pub/Sub `dev:{deviceId}` on the **session** Redis instance (`REDIS_URL`) |
| Subscribe | Gateway subscribes when a device completes WSS handshake |
| Publish | `FanOutDeviceCommand` (and WSS peer `event` frames) publish JSON onto the channel |
| Delivery | Only nodes with an active subscription (open socket) receive and write the WS frame |

No sticky routing table is required: Redis delivers to all subscribers; non-holding nodes simply are not subscribed.

## Adapters

| Mode | Adapter |
| --- | --- |
| `REDIS_URL` set | `IoredisRedisClient` (dedicated subscriber connection for `SUBSCRIBE`) |
| unset (local/tests) | `InMemoryRedisClient` process-local Pub/Sub |

## Follow-ups

- **BE-080** — `POST .../send-to-tv` uses `FanOutDeviceCommand` when presence shows online
- **BE-081** — push fallback when `subscriberCount === 0` / no presence
