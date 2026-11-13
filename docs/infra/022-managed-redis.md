# INF-022: Managed Redis (ElastiCache)

- **Status:** Accepted (Sprint 0 **mock** Terraform — no live apply)
- **Refs:** Infra §2.2; Backend §5.2; ADR-001; INF-003; schema companion notes (`db/migrations/001_postgres_schema.sql`)
- **Task:** INF-022
- **Mock date:** 2026-11-11

## Goal

Provision **Amazon ElastiCache for Redis** in private data subnets for sessions / token deny-list, catalog cache with TTL, and Pub/Sub realtime fan-out — with an explicit **eviction policy** and **keyspace separation** so cache pressure cannot evict deny-list or break pub/sub.

## Design

| Concern | Choice |
| --- | --- |
| Engine | Redis **7** on ElastiCache (ADR-001; Valkey-compatible key plan) |
| Placement | Private **data** subnets from INF-003 (no NAT / no public endpoint) |
| Access | `redis` SG — TCP **6379** from `app` SG only |
| Encryption | At-rest + in-transit; AUTH token via `TF_VAR` / Secrets Manager at live apply |
| App config | **`REDIS_URL`** (session/deny-list/pubsub) and **`REDIS_CACHE_URL`** (catalog cache); names only in app |
| Node client | Approved **`ioredis`** behind `RedisClient` / `IoredisRedisClient` — see `docs/dev/proposed-packages-redis.md` |

Refresh tokens remain authoritative in **PostgreSQL** (hashed). Redis holds only ephemeral deny-list / cache / presence / pub/sub (Backend §5.2 + schema notes).

### Two logical instances (required)

Cache and session/pubsub **must not** share an eviction policy (schema INF-022 note).

| Role | Replication group | `maxmemory-policy` | Workloads |
| --- | --- | --- | --- |
| **cache** | `mi-iptv-{env}-redis-cache` | **`allkeys-lru`** | Catalog / EPG cache with TTL |
| **session** | `mi-iptv-{env}-redis-session` | **`noeviction`** | JWT deny-list, rate limits, presence, **Pub/Sub** channels |

Pub/Sub rides the **session** instance so LRU cache eviction never drops pub/sub connection state or deny-list keys under memory pressure (writes that would exceed memory fail closed on session instead of silent eviction).

### Keyspace plan

| Key / channel | Instance | TTL | Purpose |
| --- | --- | --- | --- |
| `jwt:deny:{jti}` | session | remaining access-token life | Revoked access JWT deny-list |
| `rl:login:ip:{ip}` / `rl:login:acct:{hash}` | session | 900 s | Login rate limit (BE-028) |
| `rl:pin:{accountId}:{profileId}` | session | 900 s | Parental PIN verify lockout (BE-037) |
| `rl:api:{accountId}` | session | sliding 60 s | API rate limit (BE-008) |
| `presence:{deviceId}` | session | ~45 s | Heartbeat / realtime node id |
| `cache:catalog:{scope}:{queryHash}` | cache | minutes | Home rows / listings (Backend §5.2) |
| Pub/Sub `dev:{deviceId}` | session | n/a | Companion→TV commands (not persisted) |

Optional later: `pair:{code}` on session (TTL 5 min) for device pairing.

### Sizing (MVP)

| Env | Node type (both roles) | Replicas / AZ | Automatic failover |
| --- | --- | --- | --- |
| `dev` | `cache.t4g.micro` | 1 node (single-AZ) | Off |
| `qa` | `cache.t4g.small` | Multi-AZ replica | On |
| `prod` | `cache.t4g.small` | Multi-AZ replica | On |

### Private networking

- Shared ElastiCache subnet group on INF-003 **private-data** subnets.
- No public access; data tier has no internet route.
- Ingress only via network module `redis` SG from `app` on 6379.

### Parameter groups

| Group | Family | Notable params |
| --- | --- | --- |
| `mi-iptv-{env}-redis-cache` | `redis7` | `maxmemory-policy=allkeys-lru` |
| `mi-iptv-{env}-redis-session` | `redis7` | `maxmemory-policy=noeviction` |

## Module

`infra/terraform/modules/elasticache_redis` — creates subnet group + both replication groups; wired from `environments/{dev,qa,prod}`.

## Verification checklist (DoD) — mock complete

- [x] Sessions and token deny-list (session instance + `jwt:deny:*` / `rl:*` / `presence:*` key plan)
- [x] Catalog cache with TTL (cache instance + `cache:catalog:*` + `allkeys-lru`)
- [x] Pub/Sub (session instance channels `dev:{deviceId}`)
- [x] Eviction policy planned (`allkeys-lru` vs `noeviction`)
- [x] Keyspace separation between cache and pub/sub (two replication groups)

## Live cutover

1. Apply INF-003 network, then this module (`TF_VAR_redis_auth_token` from Secrets Manager).
2. Store URLs as `mi-iptv/{env}/redis_url` (session) and `mi-iptv/{env}/redis_cache_url` (cache); inject `REDIS_URL` / `REDIS_CACHE_URL`.
3. Wire backend Redis adapters (later Backend tasks) to the correct instance by key prefix.
