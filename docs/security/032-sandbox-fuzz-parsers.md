# SEC-032: Sandbox and fuzz the parsers

- **Status:** Accepted (Sprint 0)
- **Refs:** Security §4.2; BE-044
- **Task:** SEC-032
- **Date:** 2026-11-13

## Goal

Run **M3U** and **XMLTV** parsers in **isolated** workers with **CPU/time, memory, and size** caps, and **fuzz** them so malformed input fails closed without exhausting the API process.

## Design

| Parser | Streaming core | Isolation | Use case |
| --- | --- | --- | --- |
| M3U | `parseM3uPlaylistStreaming` (BE-044) | `IsolatedM3uPlaylistParser` (`worker_threads` + `resourceLimits`) | `ParseM3uPlaylist` |
| XMLTV | `parseXmltvGuideStreaming` (this task) | `IsolatedXmltvGuideParser` | `ParseXmltvGuide` |

### Resource limits (exhaustion controls)

| Cap | M3U env | XMLTV env | Role |
| --- | --- | --- | --- |
| Size | `M3U_PARSER_MAX_BYTES` | `XMLTV_PARSER_MAX_BYTES` | Reject oversized payloads before/at parse |
| Entries | `M3U_PARSER_MAX_ENTRIES` | `XMLTV_PARSER_MAX_CHANNELS` / `MAX_PROGRAMMES` | Bound output growth |
| Line length | `M3U_PARSER_MAX_LINE_LENGTH` | `XMLTV_PARSER_MAX_LINE_LENGTH` | Stop pathological lines |
| Time / CPU budget | `M3U_PARSER_TIMEOUT_MS` | `XMLTV_PARSER_TIMEOUT_MS` | Terminate worker on wall-clock overrun |
| Memory | `M3U_PARSER_MAX_OLD_GEN_MB` | `XMLTV_PARSER_MAX_OLD_GEN_MB` | Worker V8 heap ceiling |

Defaults: 20 MiB input, 30 s timeout, 64 MB old-gen (same ballpark as BE-044).

### XMLTV hardening extras

- No DOM / no third-party XML SDK (Node built-ins only).
- Reject `<!DOCTYPE` / `<!ENTITY` (`XMLTV_FORBIDDEN_DTD`) to reduce entity-expansion risk.
- Minimal channel/programme extraction for sandbox+EPG prep (full EPG product ingest remains Release 1).

### Fuzzing

In-process mutation fuzz in `tests/unit/parser-fuzz-sec032.test.ts` (64 iterations each):

- Random byte flips / appends on M3U and XMLTV seeds
- Occasional DTD prefix injection
- Assert every iteration completes with a result **or** a typed parse error (no process crash)

## Verification checklist (DoD)

- [x] Fuzz M3U parser
- [x] Fuzz XMLTV parser
- [x] CPU/time limit (`timeoutMs` + worker terminate)
- [x] Memory limit (`resourceLimits.maxOldGenerationSizeMb`)
- [x] Size / entry / line limits against resource exhaustion

## Follow-ups

- Longer fuzz campaigns / corpus in CI nightly if needed
- Wire `ParseXmltvGuide` into EPG ingest when Release 1 lands
