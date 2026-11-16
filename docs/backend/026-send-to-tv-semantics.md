# Send-to-TV semantics (PRD-026 / ADR-008)

- **Status:** Accepted (Product)
- **Refs:** Backend §2.4; FR-037; ADR-008; ADR-007; BE-080

| Item | Value |
| --- | --- |
| Path `{id}` | **Sender** device |
| Body `targetDeviceId` | **Target TV** (required, same account) |
| Multi-TV | No auto-pick — target required |
| Offline TV | Queue `play` in `device_commands`; deliver on reconnect / push wake |
| Expiry | **5 minutes** |
| Live remote | Not this endpoint — WSS only (ADR-007) |

Implementation: **BE-080**.
