# ADR-007: Realtime transport for companion ↔ TV

- **Status:** Accepted
- **Date:** 2026-11-15
- **Deciders:** Product (PRD-027)
- **Refs:** Backend §1; FR-036; INF-022; BE-077; BE-081

## Context

Specs describe companion→TV and status delivery as **“WebSocket / SSE / push”** without naming a primary path. BE-077 (realtime gateway) and related device work need one primary transport plus an explicit fallback before implementation.

Companion remote control (D-pad, keyboard, transport, send-to-TV) needs **low-latency bidirectional** messaging when both ends are online. Infra already plans Redis/Valkey Pub/Sub fan-out (`dev:{deviceId}`), presence (`presence:{deviceId}` ~45s), and FCM/APNs via device `push_token` (BE-081).

## Decision

| Concern | Choice |
| --- | --- |
| Primary transport | **Authenticated WebSocket (WSS)** for TV and companion when online |
| Fan-out across BFF nodes | **Redis/Valkey Pub/Sub** on `dev:{deviceId}` (and related channels per Backend §5.2) |
| Presence | Heartbeat / node binding via `presence:{deviceId}` (~45 s TTL) |
| Fallback | **FCM / APNs** when the target device has **no open realtime socket** |
| Fallback use | Wake / status / queued **send-to-TV** and companion-status notify — not a substitute for live remote |
| Persisted commands | `device_commands` queue (play / send-to-TV) with short TTL (**5 min**, ADR-008 / PRD-026) |
| SSE | **Not used** for MVP realtime |

Push must **not** run when an open socket exists for that device (BE-081 `DeviceSocketPresence`).

## Consequences

- Backend §1 / FR-036 wording becomes: **WebSocket primary**, **push fallback**; drop “or SSE” as an equal alternative.
- **BE-077** implements authenticated WSS: per-device channels, heartbeat, reconnect/resume, connection limits — not SSE.
- **BE-081** remains the push fallback path; live FCM/APNs adapters still require package approval.
- Clients must open WSS for interactive remote; push alone is insufficient for D-pad latency.

## Rejected for MVP

- **SSE as primary** — poor fit for bidirectional remote; would need a parallel HTTP uplink and higher latency.
- **WebSocket only (no push)** — offline / background devices get nothing; conflicts with `push_token` and BE-081.
- **Push-only companion→TV** — too slow and unreliable for remote control; acceptable only as notify/wake.
