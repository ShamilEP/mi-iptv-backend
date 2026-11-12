# Proposed packages for BE-007 (DB access)

**Status:** Proposed — **do not install** until human approves.

BE-007 ships migration/seed tooling via **`psql`** (no new npm dependency). When use cases need in-process Postgres access, approve one client and wrap it behind an adapter.

| Package | Purpose | Alternatives |
| --- | --- | --- |
| `pg` | Official node-postgres driver for app repositories / optional migrate runner | `postgres` (porsager), `pg-promise` |
| `@types/pg` | TypeScript types (if `pg` lacks bundled types for our TS version) | — |

Not proposed for BE-007 DoD: Prisma / Drizzle / Knex (heavier; can revisit later).

After approval: implement `infrastructure/persistence/pg-*` adapters only; domain/application never import `pg`.
