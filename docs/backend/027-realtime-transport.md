# Realtime transport contract (PRD-027 / ADR-007)

- **Status:** Accepted (Product)
- **Refs:** Backend §1; FR-036; ADR-007; BE-077; BE-081; INF-022

| Item | Value |
| --- | --- |
| Primary | **Authenticated WSS** (TV + companion) |
| Fan-out | Redis/Valkey Pub/Sub `dev:{deviceId}` |
| Presence | `presence:{deviceId}` ~45 s |
| Fallback | **FCM / APNs** when no open socket |
| SSE | Out of MVP scope |

Implementation: **BE-077** (gateway) + **BE-081** (push fallback).
