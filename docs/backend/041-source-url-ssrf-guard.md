# BE-041: Validate source input and block SSRF

- **Status:** Implemented (awaiting review)
- **Refs:** Security §4.2; INF-003 (network defense in depth)
- **Task:** BE-041
- **Date:** 2026-11-12

## Goal

Ensure user-supplied IPTV source URLs (M3U / Xtream) cannot be abused for **SSRF**:
only `http`/`https`, no private/loopback/link-local/metadata targets, re-check after
DNS and each redirect, and cap redirects + response size.

## Controls

| Control | Where |
| --- | --- |
| Scheme allowlist (`http`/`https`) | `parseSourceUrl` (domain) |
| Metadata / localhost hostnames | `isBlockedMetadataHostname` |
| Private / loopback / link-local / IMDS ranges | `isBlockedNetworkAddress` |
| DNS re-check (all A/AAAA) | `ValidateSourceUrl` + `DnsResolver` |
| Redirect re-check + max redirects | `FetchSourceUrlSafely` |
| Response size + timeout | `SourceHttpClient` + env caps |
| Connect to resolved IP + `Host`/`servername` | `NodeSourceHttpClient` (rebinding mitigation) |

## Env (names only)

| Name | Default | Purpose |
| --- | --- | --- |
| `SOURCE_HTTP_MAX_REDIRECTS` | `3` | Max redirect hops |
| `SOURCE_HTTP_MAX_RESPONSE_BYTES` | `5242880` (5 MiB) | Playlist body cap |
| `SOURCE_HTTP_TIMEOUT_MS` | `15000` | Per-hop timeout |

## Usage

Composition root wires:

- `ValidateSourceUrl` — call on `POST /sources` input and before any outbound fetch
- `FetchSourceUrlSafely` — call for ingest / `POST /sources/{id}/test`

Sources HTTP routes (BE-040 follow-ups) must use these use cases; do not call raw `fetch`/`http.request` for user URLs.

## Out of scope

- Full source CRUD / playlist parsers (separate tasks)
- Network egress SG rules (INF-003 already documents defense in depth)
