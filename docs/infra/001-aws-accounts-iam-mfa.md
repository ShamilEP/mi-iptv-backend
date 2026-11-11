# INF-001 Runbook: AWS accounts, IAM, MFA

- **Status:** Draft — awaiting human AWS Organizations admin execution
- **Refs:** ADR-001 (AWS); Infra §2.1; Security secrets rules
- **Task:** INF-001

## Goal

Establish separate **DEV**, **QA**, and **PROD** AWS accounts (or equivalent strong isolation), least-privilege human/machine roles, and **MFA for all human principals**.

## Target account model

Use **AWS Organizations** with a management (billing) account that does **not** run application workloads.

| Account alias | Purpose |
| --- | --- |
| `mi-iptv-mgmt` | Org root, billing, SCPs, SSO/IdP — no app resources |
| `mi-iptv-dev` | Developer integration / CI to DEV |
| `mi-iptv-qa` | Staging; contract tests; mock/test IPTV sources |
| `mi-iptv-prod` | Production user traffic |

Region default (change only via later ADR): prefer a single primary region for MVP (e.g. `us-east-1`) unless latency/compliance requires otherwise.

## Least-privilege roles (human)

Prefer **IAM Identity Center (SSO)** permission sets over long-lived IAM users.

| Permission set | Accounts | Intended access |
| --- | --- | --- |
| `PlatformAdmin` | mgmt (+ break-glass on others) | Org, SSO, SCPs — break-glass only |
| `BackendDeveloper` | DEV (QA read-only optional) | ECS/ECR read-deploy DEV, CloudWatch read, no IAM/KMS admin |
| `QaEngineer` | QA | Deploy/read QA, CloudWatch; no PROD write |
| `ReadonlyAuditor` | DEV/QA/PROD | SecurityAudit / ViewOnly |
| `ProdOperator` | PROD | Limited ops (ECS update, RDS describe); no IAM user create; no KMS key delete |

Deny by SCP (org-wide where possible):

- Leave organization / disable CloudTrail
- Create IAM users with console password lacking MFA condition (prefer SSO-only humans)
- Disable GuardDuty / Config in PROD (once enabled in later tasks)

## MFA for all humans

1. Enforce MFA on Identity Center users (or root + every IAM user if SSO not ready).
2. Management account **root**: hardware or virtual MFA; store recovery codes offline (not in git).
3. Require MFA for sensitive console actions via IAM condition keys (`aws:MultiFactorAuthPresent`) on break-glass roles.
4. No shared human credentials; CI uses **OIDC roles** (later INF CI tasks), not long-lived keys in repos.

## Machine / CI identities (placeholder for later INF)

- GitHub Actions (or GitLab) → assume role per account via OIDC (`mi-iptv-ci-dev`, `mi-iptv-ci-qa`, `mi-iptv-ci-prod`).
- No AWS access keys committed; never store account root passwords in the backend repo.

## Verification checklist (DoD)

Mark each only after live confirmation (account IDs may be recorded in a **private** ops vault — **not** in this repo if treated as sensitive ops data; alias + existence is enough here):

- [ ] `mi-iptv-dev` account exists and is in the Organization
- [ ] `mi-iptv-qa` account exists and is in the Organization
- [ ] `mi-iptv-prod` account exists and is in the Organization
- [ ] Workloads are not deployed in the management account
- [ ] Human access uses SSO permission sets (or documented temporary exception)
- [ ] MFA enforced for all human console/SSO users including root
- [ ] Least-privilege sets above (or documented equivalents) created

## Agent / local environment notes

- This workstation had **no AWS CLI** when INF-001 was attempted.
- Agents must **not** read `*.env*` or paste secrets into chat.
- Completing INF-001 requires a human with Organizations admin rights to execute this runbook, then re-open the task for verification.
