# Approved package for Redis/Valkey (INF-022 / realtime & cache)

**Status:** **Approved** (2026-11-12) — `ioredis`.  
**Infra context:** dual ElastiCache instances — session (`REDIS_URL`) and cache (`REDIS_CACHE_URL`); see `docs/infra/022-managed-redis.md`.

| Package | Purpose | Alternatives (not selected) |
| --- | --- | --- |
| **`ioredis`** | Redis/Valkey client for deny-list, rate limits, presence, catalog cache, pub/sub | `redis` (node-redis v4+) |

## Adapter boundary

| Layer | Rule |
| --- | --- |
| Domain / application | Depend on `RedisClient` only — never import `ioredis` |
| Infrastructure | `IoredisRedisClient` in `src/infrastructure/cache/ioredis-redis-client.ts` |
| Composition | One client per URL role (session vs cache); do not share eviction policies |

Higher-level ports (`TokenDenyList`, `RateLimiter`, `PresenceStore`, `CatalogCache`, `RealtimePubSub`) should wrap `RedisClient`, not `ioredis` directly.
