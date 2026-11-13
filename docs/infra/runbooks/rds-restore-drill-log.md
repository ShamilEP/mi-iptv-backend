# RDS restore drill log (INF-021)

## Entry: INF-021-tabletop-2026-11-13

| Field | Value |
| --- | --- |
| Type | Tabletop (Sprint 0 mock — no live AWS restore) |
| Date (UTC) | 2026-11-13 |
| Target env | `qa` |
| Mode | PITR to new instance (walkthrough) |
| Facilitator | Cursor Agent |
| Runbook | `docs/infra/runbooks/rds-restore.md` |
| Terraform evidence | `infra/terraform/modules/rds_postgres` retention > 0, backup window, PITR output |

### Checklist

- [x] Confirmed daily backup retention defaults: dev=1, qa=3, prod=7
- [x] Confirmed `backup_window` does not overlap `maintenance_window`
- [x] Confirmed PITR enabled when `backup_retention_period > 0` (module output + tags)
- [x] Walked snapshot restore steps A1–A10 against the runbook
- [x] Walked PITR restore steps B1–B6 against the runbook
- [x] Confirmed secrets policy: no credentials in git; drill uses separate secret name
- [x] Confirmed prod keeps automated backups on destroy (`delete_automated_backups = false`)
- [x] Recorded follow-up: live qa restore after INF-020 apply

### Result

**Pass** (tabletop). Live restore deferred until RDS exists in AWS.
