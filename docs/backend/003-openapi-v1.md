# BE-003: OpenAPI MVP v1 freeze

- **Status:** Accepted (Sprint 0)
- **Refs:** SRS §8, §25, §28; Backend §2; ADR-010 (PRD-025); ADR-005/007/008/009; BE-003
- **Contract:** `openapi/openapi.json` (`info.version` **1.0.0**)
- **Inventory:** `openapi/mvp-v1-inventory.ts`

## Goal

Freeze the MVP HTTP + WSS surface so TV / companion / backend work can proceed against one contract. EPG is **Release 1** (omitted).

## Coverage (ADR-010 Package A)

| Area | Paths |
| --- | --- |
| Ops | `GET /health` |
| Auth | register, login, refresh, logout, `reset-password`, `reset-password/confirm` |
| Account | export, delete |
| Profiles | CRUD + PIN / restrictions / privacy / history |
| Sources | list/create/PATCH/delete/test |
| Catalog | channels, vod, search, `items/{id}` |
| Sync / favorites | `state`, playback, favorites, settings, events |
| Devices | list/register/heartbeat/unlink, companion-status, `send-to-tv` |
| Diagnostics | `qoe`, `network` |
| Realtime | `GET /realtime` → WSS upgrade (ADR-007) |

Favorites are under **`/sync/favorites`** (not a separate `/favorites` tree).

## Verification

```bash
npm run openapi:verify
```

Rules:

1. Every `ROUTE_CATALOG` operation exists in OpenAPI and in the MVP inventory.
2. Every MVP inventory operation exists in OpenAPI.
3. OpenAPI has no operations outside the MVP inventory.
4. `info.version` is `1.0.0`.

Contract-only operations (`implemented: false` in the inventory) are frozen for clients but not yet wired in the presentation layer — implementers must add `ROUTE_CATALOG` + handlers when shipping those tasks.

## Re-apply merge script

`scripts/apply-openapi-mvp-v1.ts` merges the BE-003 additions. Prefer editing `openapi.json` directly for small fixes; re-run the script only when replaying the freeze block.
