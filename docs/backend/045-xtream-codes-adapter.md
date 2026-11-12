# BE-045: Build the Xtream Codes adapter

- **Status:** Implemented (awaiting review)
- **Refs:** FR-024, FR-038; BE-041 (SSRF)
- **Task:** BE-045
- **Date:** 2026-11-12

## Goal

Talk to Xtream Codes `player_api.php`: authenticate, fetch live / VOD / series
categories and listings, build playable stream URLs, and fail closed on expired
or blocked accounts.

## Design

| Piece | Role |
| --- | --- |
| `assertXtreamAccountUsable` | Map `user_info` → auth/expired/blocked errors |
| `buildXtreamStreamUrl` / `buildXtreamPlayerApiUrl` | Pure URL builders |
| `HttpXtreamCodesClient` | player_api JSON client over `FetchSourceUrlSafely` |
| `FetchXtreamCatalog` | Application entry (auth + full catalog pull) |

### player_api actions

| Action | Purpose |
| --- | --- |
| *(none)* | Auth + `user_info` / `server_info` |
| `get_live_categories` / `get_live_streams` | Live TV |
| `get_vod_categories` / `get_vod_streams` | Movies |
| `get_series_categories` / `get_series` | Series list |

Stream URL shapes (credentials in path — **never log**):

- Live: `{base}/live/{user}/{pass}/{id}.ts`
- VOD: `{base}/movie/{user}/{pass}/{id}.{ext}`
- Series episode: `{base}/series/{user}/{pass}/{episodeId}.{ext}` via `buildXtreamStreamUrl({ kind: 'series', ... })`

### Account handling

| Panel signal | Error code |
| --- | --- |
| `auth` ≠ 1 | `XTREAM_AUTH_FAILED` |
| `status` Expired / past `exp_date` | `XTREAM_ACCOUNT_EXPIRED` |
| `status` Banned/Blocked/Disabled | `XTREAM_ACCOUNT_BLOCKED` |

## Out of scope

- Persisting into `catalog_*` tables
- `POST /sources/{id}/test` HTTP route (BE-043)
- Episode deep-fetch (`get_series_info`) beyond URL builder helper
