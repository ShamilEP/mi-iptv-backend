# Runbook: Failover (INF-062)

**Audience:** Platform / on-call  
**Applies to:** RDS PostgreSQL Multi-AZ (INF-020), ElastiCache Redis Multi-AZ (INF-022), single-AZ loss  
**Safety:** Prefer **observing automatic failover** before manual promotion. Never point prod at a drill/restore instance without the restore cutover checklist.

## Preconditions

1. Know the env (`dev` / `qa` / `prod`) and whether Multi-AZ is enabled:

| Env | RDS Multi-AZ | Redis Multi-AZ / auto-failover |
| --- | --- | --- |
| `dev` | Off | Off |
| `qa` | On | On |
| `prod` | On | On |

2. Operator can describe RDS / ElastiCache / ECS / ALB (read) and update ECS if DNS/secrets must move.
3. NFR-014 target: restore API availability; database Multi-AZ contributes AWS RDS Multi-AZ SLA **99.95%** on prod.

## A. RDS Multi-AZ failover (qa / prod)

Automatic path (preferred):

1. Confirm symptom: elevated DB errors, failover event in RDS console / EventBridge / “Failover” in recent events.
2. **Do not** reboot both AZs or delete the instance during failover.
3. Wait for new primary DNS endpoint to stabilize (same hostname; CNAME/IP may change — clients should reconnect).
4. Watch ECS task logs for pool reconnect; `/health` should recover when DB accepts connections.
5. Smoke: login + one write (e.g. playback upsert) + one read.
6. Record failover start/end (UTC) and whether it was automatic.

Manual reboot failover (only if AWS guidance / stuck primary):

1. Change ticket required on prod.
2. Reboot RDS with **failover** if Multi-AZ and a healthy standby exists.
3. Repeat smoke steps A4–A5.
4. If reboot fails or standby unhealthy → escalate to [rds-restore.md](./rds-restore.md) (PITR / snapshot to new instance).

## B. ElastiCache Redis failover (qa / prod)

1. Confirm replication group status / automatic failover events for `mi-iptv-{env}-redis-session` and `-redis-cache`.
2. Allow AWS to promote the replica; clients using the **primary endpoint** should follow.
3. Expect brief pub/sub disconnects and deny-list gaps; access JWTs expire ≤ 3600 s; refresh remains in Postgres.
4. If AUTH failures spike after failover, verify `REDIS_URL` secret was not rotated mid-incident ([key-compromise.md](./key-compromise.md) only if AUTH leak suspected).
5. Smoke: rate-limit path still responds; realtime subscribe reconnects (when INF realtime is live).

## C. Single AZ loss / networking

1. Confirm AZ impairment (AWS Health Dashboard).
2. Prod/qa: Multi-AZ data plane should move; ECS tasks on the failed AZ will be replaced by the scheduler onto healthy AZs (when service + capacity providers exist).
3. ALB: unhealthy targets drain; confirm remaining targets on `/health`.
4. If the **only** NAT / ALB AZ is impaired and capacity cannot schedule → SEV-1; consider temporary scale-out in the healthy AZ (INF-012 prod autoscaling when live).
5. `dev` (single-AZ data): accept outage or restore from snapshot into another AZ for internal use only.

## D. Region-level disaster (MVP note)

MVP is **single-region** (`us-east-1` mock). There is no warm standby region yet.

1. Declare SEV-1; communicate user-visible outage.
2. Preserve evidence; do not delete failed resources until snapshotted.
3. Recovery path: wait for region recovery **or** rebuild env from Terraform + [rds-restore.md](./rds-restore.md) into an alternate region (future DR project — out of Sprint 0 scope).
4. Do not improvise cross-region DNS without a change ticket and tested runbook.

## E. Verification checklist after failover

- [ ] `/health` 200 on api hostname
- [ ] Auth login succeeds
- [ ] Sync write + read succeeds
- [ ] No plaintext secrets in recent logs
- [ ] Incident timeline updated (UTC)

## Rollback / undo

- Automatic Multi-AZ failovers are not “rolled back”; failing back is another failover once the original AZ is healthy (optional, off-peak, change ticket).
- If you manually pointed secrets at a restore instance, revert via [deploy-rollback.md](./deploy-rollback.md) section C + restore runbook rollback.
