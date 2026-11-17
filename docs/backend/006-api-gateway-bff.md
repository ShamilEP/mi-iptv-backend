# BE-006: API Gateway / BFF skeleton

- **Status:** Implemented (MVP)
- **Refs:** Backend §1; Infra §2.2; Security §4.1; ADR-002; ADR-011; BE-005
- **Code:** `src/presentation/http/gateway/*`, `src/application/gateway/*`, `NodeHttpServer`

## Checklist (DoD)

| Concern | Rule | Artifact |
| --- | --- | --- |
| Routing | Business routes under `/api/v1`; `/health` (ALB) + `/realtime` unversioned | `api-versioning`; route catalog; gateway path gate |
| JWT middleware | Bearer RS256 + deny-list; sets `request.auth` / `accountId` | `AssertAccessTokenActive`; `jwt-auth-middleware` |
| Request validation | JSON Content-Type when body present; max body bytes | `request-validation-hook`; `readJsonBody` cap |
| Rate-limit hook | 100 rpm per token; stricter anonymous IP (BE-008); skip `/health` | `ApiRateLimitGuard`; `rate-limit-hook` |
| Health | `GET /health` → `{ status: "ok" }` for load balancer | `createHealthRoute`; `GetHealthStatus` |

## Auth modes

| Route | Mode |
| --- | --- |
| `GET /health` | `public` (no JWT, no rate limit) |
| `POST /api/v1/auth/register\|login\|refresh` | `public` (stricter IP rate limit — BE-008) |
| All other registered `/api/v1/*` | `required` (JWT + token rate limit) |

## Env knobs (names only)

- `API_RATE_LIMIT_MAX_REQUESTS` (default `100`)
- `API_RATE_LIMIT_ANONYMOUS_MAX_REQUESTS` (default `20`)
- `API_RATE_LIMIT_WINDOW_SECONDS` (default `60`)
- `API_MAX_JSON_BODY_BYTES` (default `1048576`)

See also `docs/backend/008-global-rate-limiting.md`.
