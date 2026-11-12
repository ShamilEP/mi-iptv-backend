# INF-023: KMS keys and IAM for credential encryption

- **Status:** Accepted (Sprint 0 **mock**)
- **Refs:** Security §5; INF-013; INF-001; ADR-001
- **Task:** INF-023
- **Mock date:** 2026-11-10

## Goal

Create **one KMS CMK per environment** for IPTV source-credential encryption (AES-256-GCM DEKs at rest), with a **rotation schedule** and **least-privilege IAM** so only the backend task role in that environment can use the key.

## Sprint 0 mock decision

Live AWS KMS/IAM are deferred (same posture as INF-001 / INF-013). This document plus the in-repo catalog (`CredentialEncryptionKeyCatalog`) and policy stubs are the accepted Sprint 0 baseline.

## Keys per environment

Dedicated CMKs for **source credential** envelope protection (distinct from optional general secrets CMKs in INF-013 so IAM can be tighter).

| Env | Alias | Mock key ARN | Account |
| --- | --- | --- | --- |
| `dev` | `alias/mi-iptv-dev-source-credentials` | `arn:aws:kms:us-east-1:000000000001:key/mock-dev-source-creds` | `mi-iptv-dev` |
| `qa` | `alias/mi-iptv-qa-source-credentials` | `arn:aws:kms:us-east-1:000000000002:key/mock-qa-source-creds` | `mi-iptv-qa` |
| `prod` | `alias/mi-iptv-prod-source-credentials` | `arn:aws:kms:us-east-1:000000000003:key/mock-prod-source-creds` | `mi-iptv-prod` |

Rules:

- No cross-environment decrypt (DEV key never unwraps PROD DEKs).
- Key material never in git; only alias/ARN references (`SOURCE_CREDENTIALS_KMS_KEY_ID` optional override).
- DB stores AES-256-GCM ciphertext only; KMS protects the DEK (or wraps `SOURCE_CREDENTIALS_DATA_KEY` in Secrets Manager).

## Rotation schedule

| Asset | Schedule | Notes |
| --- | --- | --- |
| CMK (AWS KMS) | Automatic annual rotation enabled when live | AWS rotates backing key material; alias/ARN stay stable |
| Application DEK (`SOURCE_CREDENTIALS_DATA_KEY`) | Every **365 days**, or on suspected compromise | Re-encrypt existing source credential rows; dual-read old/new during cutover |
| Break-glass / emergency | Immediate disable + new DEK | Documented in ops runbook (private); not in this repo |

Mock catalog exposes `rotationIntervalDays: 365` and `automaticCmkRotation: true` for each env key.

## Least-privilege access

Human SSO sets (INF-001) do **not** get `kms:Decrypt` on PROD credential keys by default.

| Principal | Allowed KMS actions | Scope |
| --- | --- | --- |
| ECS task role `mi-iptv-api-task-{env}` | `Encrypt`, `Decrypt`, `GenerateDataKey`, `DescribeKey` | That env’s source-credentials CMK only |
| CI OIDC `mi-iptv-ci-{env}` | `DescribeKey` only (no decrypt of prod data) | Same key ARN |
| `PlatformAdmin` / break-glass | Full KMS admin with MFA | Org policy; rare |
| `BackendDeveloper` | DEV: Encrypt/Decrypt/DescribeKey; QA/PROD: none | DEV key only |

Policy stubs (mock JSON for later IaC):

- `docs/infra/policies/kms-source-credentials-task-role.json` (CMK use + DEK secret read)
- `docs/infra/policies/kms-source-credentials-deny-cross-env.json`
- `docs/infra/policies/kms-source-credentials-ci-role.json` (DescribeKey only; deny decrypt)

SEC-030 reviewed these stubs and added the CI role + DEK secret ARN scope.

## Verification checklist (DoD) — mock complete

- [x] Key per environment (dev/qa/prod aliases + mock ARNs + catalog)
- [x] Rotation schedule (CMK annual + DEK 365-day)
- [x] Least-privilege access (role matrix + policy stubs)

## Live cutover (follow-up)

1. Create CMKs + aliases in each account; enable automatic rotation.
2. Attach task-role policies; remove any temporary broad KMS grants.
3. Wire Secrets Manager DEK secret to CMK; rotate DEK on the schedule above.
