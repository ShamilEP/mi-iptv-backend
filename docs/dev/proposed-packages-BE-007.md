# Approved packages for DB access (BE-007 / persistence)

**Status:** **Approved** (2026-11-12) — `pg` + `@types/pg`.  
**Note:** Source/device registries still use in-memory repositories until Postgres adapters are wired onto `RelationalDatabase`.

Migrations/seeds continue via **`psql`** + `DATABASE_URL`. In-process SQL uses the approved client **behind a port**.

| Package | Purpose | Alternatives (not selected) |
| --- | --- | --- |
| **`pg`** | Official node-postgres driver for repository / SQL adapters | `postgres` (porsager), `pg-promise` |
| **`@types/pg`** | TypeScript types | — |

Not approved: Prisma / Drizzle / Knex (heavier; revisit later if needed).

## Adapter boundary

| Layer | Rule |
| --- | --- |
| Domain / application | Depend on `RelationalDatabase` only — never import `pg` |
| Infrastructure | `PgPoolRelationalDatabase` in `src/infrastructure/persistence/pg-pool-relational-database.ts` |
| Composition | Optional via `DATABASE_URL` (`createPgPoolRelationalDatabaseFromEnv`) |

Repository adapters (`pg-source-repository`, `pg-device-repository`, …) should take `RelationalDatabase`, not `pg.Pool` directly.
