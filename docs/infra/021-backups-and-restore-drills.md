# INF-021: Backups and restore drills

- **Status:** Accepted (Sprint 0 **mock** — no live RDS restore)
- **Refs:** Infra §2.2; NFR-014; ADR-001; INF-020
- **Task:** INF-021
- **Mock date:** 2026-11-13

## Goal

Ensure **automatic daily backups**, **point-in-time recovery (PITR)**, and a **documented + rehearsed** restore path for Amazon RDS PostgreSQL (app schema).

## Design

| Concern | Choice |
| --- | --- |
| Daily backups | RDS `backup_retention_period` > 0 + UTC `backup_window` (INF-020 module) |
| PITR | Enabled automatically when retention > 0 (continuous WAL / transaction logs for the retention window) |
| Restore target | Always restore to a **new** instance (never overwrite prod in place during drills) |
| Secrets | Restored instance gets a new managed master secret; compose `DATABASE_URL` via INF-013 names only |

### Retention (from INF-020)

| Env | Retention | PITR window | Delete automated backups on destroy |
| --- | --- | --- | --- |
| `dev` | 1 day | ~1 day | Yes |
| `qa` | 3 days | ~3 days | Yes |
| `prod` | 7 days | ~7 days | **No** |

Backup window (UTC): `07:00–08:00`. Maintenance: `sun:08:00–sun:09:00` (after backup window).

### Restore modes

1. **Snapshot restore** — restore from the latest (or chosen) automated/manual snapshot to a new identifier.
2. **PITR restore** — restore to a timestamp within the earliest restorable time … latest restorable time window.

Runbook: [`runbooks/rds-restore.md`](./runbooks/rds-restore.md).

## Rehearsed restore (Sprint 0 tabletop)

Live AWS restore is deferred with INF-020 cutover. Sprint 0 **tabletop drill** walked the runbook against Terraform + checklist:

| Field | Value |
| --- | --- |
| Drill ID | `INF-021-tabletop-2026-11-13` |
| Date (UTC) | 2026-11-13 |
| Environment target | `qa` (preferred rehearsal env before prod) |
| Mode rehearsed | PITR to new instance + cutover checklist |
| Facilitator | Cursor Agent (Sprint 0 mock) |
| Evidence | Checklist completed in [`runbooks/rds-restore-drill-log.md`](./runbooks/rds-restore-drill-log.md) |
| Result | **Pass** (tabletop) |

## Module changes (INF-021)

`infra/terraform/modules/rds_postgres`:

- Configurable `backup_window` / `maintenance_window`
- `delete_automated_backups` (prod keeps backups after destroy)
- Tags + outputs: `backup_retention_days`, `backup_window`, `point_in_time_recovery_enabled`

## Verification checklist (DoD) — mock complete

- [x] Automatic daily backups configured (retention + window in Terraform)
- [x] Point-in-time recovery documented and enabled when retention > 0
- [x] Restore procedure documented (snapshot + PITR)
- [x] Restore rehearsed (Sprint 0 tabletop + drill log)

## Live cutover

1. Apply INF-020 RDS in target env; confirm `LatestRestorableTime` in AWS console/CLI.
2. Run a **qa** PITR restore drill using the runbook (new instance, private data subnets, app SG).
3. Validate migrations/`app` schema + smoke login on the restored endpoint.
4. Tear down the drill instance; record results in a new drill-log entry.
5. Schedule quarterly prod tabletop + annual qa live restore.
