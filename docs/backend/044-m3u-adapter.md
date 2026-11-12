# BE-044: Build the M3U adapter

- **Status:** Implemented (awaiting review)
- **Refs:** FR-024, FR-038; Security §4.2
- **Task:** BE-044
- **Date:** 2026-11-12

## Goal

Provide a **streaming** M3U parser that extracts `#EXTINF` IPTV attributes
(`tvg-id`, `tvg-name`, `tvg-logo`, `group-title`), tolerates encodings and
malformed lines, and runs **isolated** under strict time/memory/size caps.

## Design

| Piece | Role |
| --- | --- |
| `parseExtInfLine` (domain) | Attribute extraction |
| `parseM3uPlaylistStreaming` | Line-oriented parse, O(line) scan, skip bad rows |
| `IsolatedM3uPlaylistParser` | `worker_threads` + `resourceLimits` + timeout |
| `ParseM3uPlaylist` | Application use case / port entry |

Encodings: UTF-8 (BOM), UTF-16 LE/BE (BOM), latin1 fallback when UTF-8 is heavily replacement-corrupted.

Malformed handling: orphan URIs, EXTINF without URI, `file:` / unknown schemes, overlong attributes → skipped (counted in `stats.skippedLineCount`), not fatal.

## Limits (env names)

| Name | Default |
| --- | --- |
| `M3U_PARSER_MAX_BYTES` | 20 MiB |
| `M3U_PARSER_MAX_ENTRIES` | 100000 |
| `M3U_PARSER_MAX_LINE_LENGTH` | 16384 |
| `M3U_PARSER_TIMEOUT_MS` | 30000 |
| `M3U_PARSER_MAX_OLD_GEN_MB` | 64 |

## Out of scope

- Persisting parsed entries into `catalog_*` (later ingest)
- `POST /sources/{id}/test` wiring (BE-043)
- Xtream adapter (BE-045)
