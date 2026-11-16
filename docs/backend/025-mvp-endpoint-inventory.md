# MVP endpoint inventory (PRD-025 / ADR-010)

- **Status:** Accepted (Product)
- **Refs:** SRS §8; Backend §2; ADR-010; BE-003

## Package A — in MVP OpenAPI

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | ALB probe (not under `/api/v1`) |
| * | `/api/v1/profiles…` | Profile CRUD + PIN / restrictions / privacy / history |
| `PATCH` | `/api/v1/sources/{id}` | Edit, priority, disable |
| `GET` | `/api/v1/catalog/items/{id}` | Content detail (FR-012) |
| `POST` | `/api/v1/auth/reset-password/confirm` | Complete password reset |
| `POST` | `/api/v1/diagnostics/qoe` | QoE events |
| `GET` | `/api/v1/diagnostics/network` | Latency probe |
| WSS | realtime gateway | Auth + `deviceId` (ADR-007) |

Plus existing §2.1–2.4 auth, sources, catalog list/search, sync, devices.

## Out of MVP freeze

- `GET /epg` (+ now/next) — **Release 1**

Implementation freeze: **BE-003**.
