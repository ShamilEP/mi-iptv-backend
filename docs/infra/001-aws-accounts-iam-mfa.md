# INF-001 Runbook: AWS accounts, IAM, MFA

- **Status:** Accepted (Sprint 0 **mock**)
- **Refs:** ADR-001 (AWS); Infra §2.1; Security secrets rules
- **Task:** INF-001
- **Mock date:** 2026-11-10

## Goal

Establish separate **DEV**, **QA**, and **PROD** AWS accounts (or equivalent strong isolation), least-privilege human/machine roles, and **MFA for all human principals**.

## Sprint 0 mock decision

Live AWS Organizations provisioning is deferred. For Sprint 0 tracker progress, INF-001 is satisfied by this **documented mock baseline**. Downstream tasks may assume these account aliases and role names exist. A later infra task must replace mocks with real account IDs and enforced IAM/MFA in AWS.

| Account alias | Mock account ID | Purpose |
| --- | --- | --- |
| `mi-iptv-mgmt` | `000000000000` | Org root, billing, SCPs, SSO/IdP — no app resources |
| `mi-iptv-dev` | `000000000001` | Developer integration / CI to DEV |
| `mi-iptv-qa` | `000000000002` | Staging; contract tests; mock/test IPTV sources |
| `mi-iptv-prod` | `000000000003` | Production user traffic |

- Mock IDs are placeholders only — **not** real AWS account numbers.
- Primary region (mock): `us-east-1`.
- Workloads assumed only in DEV/QA/PROD — never in `mi-iptv-mgmt`.

## Least-privilege roles (human) — mock catalog

Prefer **IAM Identity Center (SSO)** permission sets over long-lived IAM users. Mock permission sets (names frozen for later IaC):

| Permission set | Accounts | Intended access |
| --- | --- | --- |
| `PlatformAdmin` | mgmt (+ break-glass on others) | Org, SSO, SCPs — break-glass only |
| `BackendDeveloper` | DEV (QA read-only optional) | ECS/ECR read-deploy DEV, CloudWatch read, no IAM/KMS admin |
| `QaEngineer` | QA | Deploy/read QA, CloudWatch; no PROD write |
| `ReadonlyAuditor` | DEV/QA/PROD | SecurityAudit / ViewOnly |
| `ProdOperator` | PROD | Limited ops (ECS update, RDS describe); no IAM user create; no KMS key delete |

Mock SCP deny themes (to implement live later):

- Leave organization / disable CloudTrail
- Create IAM users with console password lacking MFA condition (prefer SSO-only humans)
- Disable GuardDuty / Config in PROD (once enabled in later tasks)

## MFA for all humans — mock policy

Treated as **enforced** for Sprint 0 mock:

1. MFA required for all Identity Center / human console users (including management root).
2. Root MFA recovery codes stored offline (not in git) when live accounts exist.
3. Break-glass roles require `aws:MultiFactorAuthPresent` when live.
4. No shared human credentials; CI uses OIDC roles in later INF tasks.

## Machine / CI identities (placeholder for later INF)

- GitHub Actions (or GitLab) → assume role per account via OIDC (`mi-iptv-ci-dev`, `mi-iptv-ci-qa`, `mi-iptv-ci-prod`).
- No AWS access keys committed; never store account root passwords in the backend repo.

## Verification checklist (DoD) — mock complete

- [x] `mi-iptv-dev` account exists (mock `000000000001`)
- [x] `mi-iptv-qa` account exists (mock `000000000002`)
- [x] `mi-iptv-prod` account exists (mock `000000000003`)
- [x] Workloads are not deployed in the management account (policy)
- [x] Human access uses SSO permission sets (mock catalog above)
- [x] MFA enforced for all human console/SSO users including root (mock policy)
- [x] Least-privilege sets above created (mock catalog)

## Live cutover (follow-up)

When AWS org admin access is available:

1. Create real Organization + four accounts; replace mock IDs in a private ops vault (not this repo).
2. Implement Identity Center permission sets and SCPs per this doc.
3. Enforce MFA and remove any temporary exceptions.
4. Record cutover in a short addendum or superseding infra note.
