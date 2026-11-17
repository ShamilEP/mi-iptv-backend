# SEC-033: Input validation and injection review

- **Status:** Implemented (awaiting review)
- **Refs:** Security §4.2; BE-006; BE-041; SEC-031; SEC-032
- **Task:** SEC-033

## Goal

Confirm parameterized queries, URL/query validation, channel/title output
normalization, and command-injection hygiene — and close the create/update
source SSRF gap called out against BE-041.

## Checklist (DoD)

| Item | Verdict | Evidence |
| --- | --- | --- |
| Parameterized queries | **Pass (ready)** | `RelationalDatabase.query(text, values?)`; `PgPoolRelationalDatabase` always binds via `pg` `values`. No runtime SQL yet (in-memory repos). Rule: future `Pg*` adapters must never string-build user input into SQL. |
| URL & query validation | **Pass** | BE-041 `ValidateSourceUrl` on **create/update** + fetch/test/Xtream; gateway JSON Content-Type + body cap (BE-006); route allow-lists (QoE, sync batch). |
| Output encoding (channel/title) | **Pass** | JSON `Content-Type` + `JSON.stringify`; `normalizeDisplayText` on M3U EXTINF, XMLTV titles, Xtream names, source display names. |
| Command-injection checks | **Pass** | No `exec` / `shell: true` in `src/` or `scripts/`; migrate/seed use `spawnSync('psql', argv[])`. Locked by unit audit test. |

## Controls by layer

### Gateway (BE-006)

- JSON Content-Type when body present; max body bytes
- JWT + rate limit on `/api/v1/*`
- Schema validation remains **route-owned** (no Zod/OpenAPI runtime validator)

### Sources / SSRF

| Path | Control |
| --- | --- |
| `POST/PATCH /sources` | `ValidateSourceUrl` before persist (SEC-033) |
| `POST …/test`, ingest, Xtream | `FetchSourceUrlSafely` + DNS/rebind guards (SEC-031) |

### Catalog text

| Source | Normalizer |
| --- | --- |
| M3U `#EXTINF` | `normalizeDisplayText` in `parse-extinf.ts` |
| XMLTV title / display-name | `normalizeOptionalDisplayText` |
| Xtream live/VOD/series/category names | `normalizeDisplayText` |
| User source `name` | `normalizeDisplayText` on create/update |

JSON transport remains the primary XSS mitigation for API clients; normalization strips NUL / bidi overrides / C0 controls before storage (STRIDE S-04).

### OS process surfaces

| Script | Invocation |
| --- | --- |
| `scripts/db-migrate.ts` / `db-seed.ts` | `spawnSync('psql', [fixed args…])` — no shell |
| OpenAPI docs test | `spawnSync(process.execPath, …)` |

Migration ledger SQL interpolates **repo-controlled** migration filenames/checksums only (regex-validated), never request input.

## Residual / follow-ups

- Wire `Pg*Repository` adapters with `$n` params + per-request `SET LOCAL app.current_account_id` (SEC-015)
- Optional OpenAPI/runtime request schema validation (package approval required)
- Catalog HTTP routes (BE-050+) must reuse `normalizeDisplayText` on public DTOs

## Tests

- `tests/unit/input-validation-injection-sec033.test.ts` — create SSRF reject, display-text, command-exec audit
- Existing: `ssrf-protection.test.ts`, `parser-fuzz-sec032.test.ts`, `api-gateway-be006.test.ts`
