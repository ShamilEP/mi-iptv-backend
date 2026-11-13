# INF-062: Disaster recovery and operations runbooks

- **Status:** Accepted (Sprint 0 **mock** baseline — no live DR exercise)
- **Refs:** NFR-014; Infra §1; INF-021; INF-020; INF-022; INF-023; SEC-030; SEC-011
- **Task:** INF-062
- **Mock date:** 2026-11-13

## Goal

Document operational procedures for **restore**, **rollback**, **key compromise**, and **failover** so on-call can recover toward ≥99% API availability (NFR-014) without inventing steps under pressure.

## Sprint 0 posture

Live AWS failover / restore drills remain deferred with INF-020/022 cutover. These runbooks are the accepted MVP ops baseline. Never paste secrets, PEMs, Redis AUTH tokens, or raw DEKs into tickets or chat — reference INF-013 **secret names** only.

## Runbook index

| Procedure | Runbook | Primary systems |
| --- | --- | --- |
| Restore | [`runbooks/rds-restore.md`](./runbooks/rds-restore.md) | RDS PostgreSQL (INF-021) |
| Rollback | [`runbooks/deploy-rollback.md`](./runbooks/deploy-rollback.md) | ECS task definition / image / migrations |
| Key compromise | [`runbooks/key-compromise.md`](./runbooks/key-compromise.md) | JWT, source DEK/CMK, Redis AUTH, push keys |
| Failover | [`runbooks/failover.md`](./runbooks/failover.md) | RDS Multi-AZ, ElastiCache Multi-AZ, AZ loss |

Index: [`runbooks/README.md`](./runbooks/README.md).

## RTO / RPO (MVP targets)

| Scenario | RTO (target) | RPO (target) | Notes |
| --- | --- | --- | --- |
| Single-AZ RDS failure (prod/qa Multi-AZ) | Minutes (AWS automatic) | Near-zero (sync standby) | See failover runbook |
| Redis primary failure (prod/qa) | Minutes (automatic failover) | Ephemeral data only | Sessions/deny-list rebuild; PG authoritative for refresh |
| Logical data corruption | Hours | ≤ prod backup retention (7d) / PITR window | Restore runbook |
| Bad deploy | Minutes | Zero (no data loss) | Rollback runbook |
| Key compromise | Hours | Depends on key class | Key-compromise runbook; revoke sessions |

Tune after first live drills; do not invent tighter SLAs without measurement.

## Severity guide

| Severity | Examples | First runbook |
| --- | --- | --- |
| SEV-1 | Prod API down / Multi-AZ failover stuck | Failover → Restore if data loss |
| SEV-2 | Bad release / elevated 5xx after deploy | Rollback |
| SEV-1/2 | Suspected JWT or DEK leak | Key compromise (contain first) |
| SEV-3 | Drill / qa rehearsal | Restore / Failover in qa |

## Verification checklist (DoD) — mock complete

- [x] Restore procedure (INF-021 RDS snapshot + PITR; linked here)
- [x] Rollback procedure (image / task definition / migration-safe steps)
- [x] Key compromise procedure (JWT, DEK/CMK, Redis AUTH, companion push)
- [x] Failover procedure (RDS Multi-AZ, Redis Multi-AZ, AZ / region notes)

## Live cutover follow-ups

1. Attach real on-call contacts and paging in the private ops channel (not in git).
2. Rehearse qa Multi-AZ failover observation + ECS rollback after INF-030/INF-042 land.
3. Annual tabletop covering all four procedures; log alongside INF-021 restore drills.
