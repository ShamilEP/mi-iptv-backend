# Runbook: Deploy and migration rollback (INF-062)

**Audience:** Platform / on-call  
**Applies to:** ECS Fargate API service (`mi-iptv-{env}`), migrations under `db/migrations/`  
**Safety:** Prefer rolling back the **application** before attempting destructive SQL. Never paste `DATABASE_URL` or image digests that embed credentials into tickets.

## Preconditions

1. Change ticket / incident id recorded.
2. Operator can update ECS service (OIDC / ProdOperator) — INF-001.
3. Know the **previous healthy** task-definition revision and ECR image tag (INF-005).
4. Confirm whether the failing deploy included a **new migration** (expand/contract — BE-007).

## A. Application / image rollback (preferred)

1. Identify last healthy ECS task-definition revision (CloudWatch / deploy history).
2. Update the ECS service to that revision (or previous ECR image tag on a new revision that only changes the container image).
3. Wait for steady state: desired = running; ALB target health Pass on `/health`.
4. Smoke: `GET /health`, login, one sync read (favorites or playback) in the affected env.
5. Announce rollback complete; leave failing revision tagged `rollback-rejected` for forensics.
6. Open a follow-up to fix-forward; do not re-promote the bad image.

## B. Migration-aware rollback

Migrations are **forward-only** (BE-007). There is no automatic `db:migrate down`.

| Situation | Action |
| --- | --- |
| Additive migration already applied; new app fails | Rollback **app** only (section A). Old app must still run against expanded schema. |
| Migration failed mid-deploy; ledger incomplete | Fix forward or restore DB from snapshot/PITR ([rds-restore.md](./rds-restore.md)); do not hand-edit `schema_migrations` without a ticket. |
| Contract migration dropped a column the old app needs | Do **not** roll back app to that old revision. Restore DB to pre-migration PITR **or** hotfix a forward migration that restores compatibility, then deploy. |
| Seeds wrongly applied | Seeds are DEV/QA only; restore or truncate affected rows — never seed prod (`ALLOW_PROD_SEED`). |

INF-024 will wire migrate-before-deploy gates; until then, treat migrate + deploy as a single change window and rehearse in **qa** first.

## C. Config / secret rollback

1. If only an env/secret injection changed, restore the previous Secrets Manager version for that INF-013 name (e.g. `mi-iptv/{env}/database_url`).
2. Force new ECS task deployment so tasks pick up the prior value.
3. Verify `/health` and auth; confirm no plaintext secrets in logs (redaction — Security §5).

## Rollback decision tree

```text
Bad deploy?
  ├─ Health failing / 5xx after image change → A (app rollback)
  ├─ Only secret/config changed → C
  └─ Data wrong after migration → B (+ restore if corruption)
```

## Post-incident

- Attach CloudWatch log group `/mi-iptv/{env}/api` excerpts (redacted).
- Note task-definition ARNs before/after.
- Schedule a qa replay of the failed change after the fix.
