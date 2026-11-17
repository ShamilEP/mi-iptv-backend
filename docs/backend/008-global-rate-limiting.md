# BE-008: Global rate limiting

- **Status:** Implemented (MVP)
- **Refs:** Security §4.1; SRS §8; INF-022; BE-006
- **Code:** `ApiRateLimitGuard`, `rate-limit-hook`, `rate-limit-headers`

## DoD

| Item | Behavior |
| --- | --- |
| Per user token | **100 req / 60 s** keyed by access JWT `jti` (`rl:api:token:{jti}`) |
| Unauthenticated | **20 req / 60 s** per client IP (`rl:api:ip:{sha256}`) — stricter than token budget |
| Headers | `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` on limited routes; `Retry-After` on **429** |
| Skip | `GET /health` (and other unversioned public paths) |

Dedicated login/register abuse counters (5 / 15 min) remain in SEC-013 / BE-028 and are additive.

## Env knobs (names only)

- `API_RATE_LIMIT_MAX_REQUESTS` (default `100`)
- `API_RATE_LIMIT_ANONYMOUS_MAX_REQUESTS` (default `20`)
- `API_RATE_LIMIT_WINDOW_SECONDS` (default `60`)
