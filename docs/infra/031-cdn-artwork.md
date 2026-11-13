# INF-031: CDN for artwork and static catalog assets

- **Status:** Accepted (Sprint 0 **mock** Terraform — no live apply)
- **Refs:** Infra §2.2; SRS §21; ADR-001 (CloudFront)
- **Task:** INF-031
- **Mock date:** 2026-11-13

## Goal

Deliver catalog **artwork / posters / banners** through a CDN with **cache policies** and a **thumbnail / resizing strategy** that protects **TV memory and bandwidth**.

## Design

| Concern | Choice |
| --- | --- |
| CDN | **Amazon CloudFront** (ADR-001) |
| Origin | Private **S3** bucket + Origin Access Control (no public bucket ACLs) |
| TLS (Sprint 0) | CloudFront default certificate; custom `cdn.{env}` + ACM us-east-1 at live cutover |
| Price class (MVP) | `PriceClass_100` (NA/EU) |

### Cache policies

| Setting | Value | Why |
| --- | --- | --- |
| Path | `/artwork/*` | Catalog imagery only |
| Min / default / max TTL | 1d / 7d / 30d | Stable posters; reduce origin fetch |
| Cookies / auth headers | none | Artwork is not session-specific |
| Query strings in cache key | none (Sprint 0) | Variants are path-based |
| Compression | gzip + brotli | Smaller payloads to TV |
| Viewer protocol | HTTPS redirect | Match edge TLS posture |

Object `Cache-Control` hint: `public, max-age=86400, s-maxage=604800` (override allowed when objects are content-hashed → `immutable`).

### Thumbnail / resizing strategy (TV memory & bandwidth)

TV clients **must not** download full-resolution source art. Ingest (catalog pipeline) **pre-generates** three variants and uploads them to the origin:

| Variant | Max width | Max height | Typical use |
| --- | --- | --- | --- |
| `thumb` | 320 | 480 | Grids / rows (lowest memory) |
| `poster` | 780 | 1170 | Detail / focus |
| `banner` | 1920 | 1080 | Hero / backdrop (still capped) |

Rules:

1. Longest edge of any TV-served object ≤ **1920** px.
2. Prefer **WebP** (or AVIF when clients support it); keep JPEG fallback as `.jpg`.
3. Object key: `artwork/{contentId}/{variant}.{ext}`.
4. Canonical API `artwork.poster` / `artwork.banner` URLs point at the CDN hostname + variant path — never at third-party source CDN full-size URLs when a local variant exists.
5. On-the-fly resize (`?w=&h=&format=`) is **deferred**; query keys are reserved in module tags for a future optimizer without changing the path contract.

Size matrix file (machine-readable): `docs/infra/artwork-thumbnail-variants.json`.

## Module

`infra/terraform/modules/cdn_artwork` — wired from `environments/{dev,qa,prod}`.

## Verification checklist (DoD) — mock complete

- [x] Cache policies defined (CloudFront cache policy + response headers + path behavior)
- [x] Thumbnail / resizing strategy documented (pre-generated variants + caps)
- [x] Strategy protects TV memory/bandwidth (no full-res to clients; compressed CDN)

## Live cutover

1. `terraform apply` CDN module; note `cdn_artwork_domain_name`.
2. Optionally attach custom domain + ACM cert in **us-east-1** for CloudFront.
3. Catalog ingest writes variants to the origin bucket; invalidate only on overwrite of non-hashed keys.
4. Backend/catalog responses emit CDN URLs using the distribution domain (env config name only).
