# SEC-031: Test SSRF protection

- **Status:** Implemented (awaiting review)
- **Refs:** Security §4.2; BE-041; INF-003
- **Task:** SEC-031
- **Date:** 2026-11-12

## Goal

Prove that source **test** and **ingest** paths reject SSRF attempts against
internal IPs, cloud metadata endpoints, DNS rebinding, and malicious redirects,
and that network **egress** is restricted as defense in depth.

## Attack matrix (automated)

| Vector | Path exercised | Expected | Test |
| --- | --- | --- | --- |
| RFC1918 / loopback literals | `ValidateSourceUrl` | `SOURCE_URL_ADDRESS_BLOCKED` | `ssrf-protection.test.ts` |
| Private DNS answers | validate + `TestSource` (M3U) | blocked / `unreachable` | same |
| AWS IMDS `169.254.169.254` | validate + redirect + test | blocked | same |
| Google metadata hostname | parse | `SOURCE_URL_HOST_BLOCKED` | same |
| AWS IMDS IPv6 `fd00:ec2::254` | validate | blocked | same |
| DNS rebinding (connect-by-IP) | `FetchSourceUrlSafely` | uses resolved IP | same |
| DNS flip on redirect hop | fetch | blocked before 2nd hop | same |
| Redirect → loopback / IMDS / private host | fetch + test | blocked | same |
| Redirect storm | fetch | `SOURCE_HTTP_REDIRECT_LIMIT` | same |
| Xtream `player_api` ingest | `HttpXtreamCodesClient` | blocked | same |

Suite: `tests/unit/ssrf-protection.test.ts`.

## Egress restrictions (INF-003 + SEC-031)

| Control | Where | Effect |
| --- | --- | --- |
| App SG egress allow-list | `security_groups.tf` | TCP 443 + DNS 53 + db/redis only (no all-traffic, **no TCP/80**) |
| Private-app NACL deny link-local | `nacl_private_app.tf` | Deny `169.254.0.0/16` egress before HTTPS/DNS allows |
| Data tier isolation | route tables | No NAT — DB/Redis cannot reach internet |
| App-layer SSRF | BE-041 | Scheme, DNS, redirect, size/time caps |

TCP/80 remains closed so instance metadata (`http://169.254.169.254`) cannot be reached even if application guards regress. Plain-HTTP IPTV sources need a future scoped allow paired with this NACL deny.

**Note:** AWS IMDS is link-local to the task/host; NACL/SG filtering of `169.254.0.0/16` is defense-in-depth for the mock network module and must not replace app-layer SSRF guards (BE-041) or IMDSv2 hop-limit hardening at compute attach time.

## Out of scope

- Live VPC penetration from AWS accounts (mock Terraform only)
- Opening TCP/80 for non-TLS playlists
