# Runbook: RDS PostgreSQL restore (INF-021)

**Audience:** Platform / on-call  
**Applies to:** `mi-iptv-{env}-postgres` (INF-020 module)  
**Safety:** Restore only to a **new** instance. Do not point prod traffic at a drill instance until verified.

Never paste master passwords, `DATABASE_URL` values, or PEMs into tickets/chat.

## Preconditions

1. AWS account for the target env (INF-001).
2. Network module applied (private data subnets + `db` SG) — INF-003.
3. Source instance has `backup_retention_period` > 0 (PITR available).
4. Operator has RDS restore permissions; no long-lived keys in git (OIDC preferred).

## A. Snapshot restore (new instance)

1. List automated snapshots for `mi-iptv-{env}-postgres`.
2. Choose snapshot id (prefer latest successful automated snapshot).
3. Restore to identifier `mi-iptv-{env}-postgres-restore-YYYYMMDD`.
4. Place in the same DB subnet group and `db` security group as the source.
5. Keep `publicly_accessible = false`, storage encrypted, parameter group `mi-iptv-{env}-pg16`.
6. Wait until status = `available`.
7. Compose `DATABASE_URL` from the new endpoint + managed secret (Secrets Manager); store under a **drill** secret name, not the live INF-013 path, until cutover is approved.
8. Run schema smoke: `SELECT 1`, confirm `app` schema / extensions.
9. Application smoke (login + health) against a temporary task using the drill secret.
10. Tear down the restore instance when done (unless promoting).

## B. Point-in-time restore (new instance)

1. Confirm earliest/latest restorable time for the source instance.
2. Pick restore timestamp `T` inside that window (UTC).
3. Restore-to-time `T` into identifier `mi-iptv-{env}-postgres-pitr-YYYYMMDDHHMM`.
4. Same networking / SG / encryption rules as snapshot restore.
5. Wait until `available`; then repeat smoke steps A7–A9.
6. Document `T`, instance id, and outcome in the drill log.

## C. Production cutover (only with change ticket)

1. Complete B (or A) in **qa** first within the last 90 days.
2. Freeze writes if required by the incident (announce).
3. Restore prod to new instance (prefer PITR to just before the incident).
4. Re-point `mi-iptv/prod/database_url` (INF-013) only after smoke Pass.
5. Keep the previous instance until post-cutover validation completes; then snapshot + decommission.

## Rollback

- Revert `DATABASE_URL` secret to the previous endpoint.
- Leave the failed restore instance stopped/tagged for forensics, then delete.
