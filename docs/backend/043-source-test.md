# BE-043: Implement POST /sources/{id}/test

- **Status:** Implemented (awaiting review)
- **Refs:** US-02; FR-001; Backend §2.2; BE-044; BE-045; BE-041
- **Task:** BE-043
- **Date:** 2026-11-12

## Goal

Connectivity-check a stored M3U or Xtream source with a timeout, and return a
**classified reason** so the UI can show a clear message while **keeping** the
user’s configured source input.

## Endpoint

`POST /api/v1/sources/{id}/test`

| Result | HTTP | `reason` |
| --- | --- | --- |
| Success | 200 | `ok` |
| Failure | 422 | `unreachable` \| `auth_failed` \| `invalid_playlist` \| `timeout` |

Response always includes masked `source` (uri/name/credentialsConfigured preserved).

## Probe behavior

| Kind | Probe |
| --- | --- |
| `m3u` | SSRF-safe fetch (`FetchSourceUrlSafely`) + isolated M3U parse; require ≥1 entry |
| `xtream` | Decrypt credentials + `player_api` authenticate |
| `proprietary` | 403 `SOURCE_NOT_TESTABLE` |

Overall wall-clock timeout uses `SOURCE_HTTP_TIMEOUT_MS` (same as SSRF fetch).

## Persistence

Updates `status` (`ok` / `error`) and `statusReason` on the source row; never deletes or clears credentials/uri on failure.
