# INF-013: Configuration and secrets management

- **Status:** Accepted (Sprint 0 **mock**)
- **Refs:** Security §5; ADR-001; INF-001 mock accounts; BE-002 (consumes this)
- **Task:** INF-013
- **Mock date:** 2026-11-10

## Goal

Provide a **secret manager**, **per-environment config injection**, and **separate KMS keys per environment** so source-credential DEKs and app secrets are never hardcoded.

## Sprint 0 mock decision

Live AWS Secrets Manager / KMS resources are deferred (same posture as INF-001). Sprint 0 treats the naming, injection contract, and per-env key isolation below as the accepted baseline. Runtime uses an **env-injected mock** (`EnvSecretStore`) that mirrors what ECS would inject from Secrets Manager. A future AWS SDK adapter may replace the mock **after package approval**.

## Environments

| App env | AWS account alias (INF-001) | Mock account ID |
| --- | --- | --- |
| `dev` | `mi-iptv-dev` | `000000000001` |
| `qa` | `mi-iptv-qa` | `000000000002` |
| `prod` | `mi-iptv-prod` | `000000000003` |

Process hint: `APP_ENV=dev|qa|prod` (preferred) with `NODE_ENV` remaining Node’s usual `development|test|production`.

## Secret manager (mock catalog)

Logical secret names (stable for IaC later). Values are never committed; local/dev may map them into process env (see adapter).

| Secret name | Purpose | Env injection name (mock) |
| --- | --- | --- |
| `mi-iptv/{env}/database_url` | Postgres URL | `DATABASE_URL` |
| `mi-iptv/{env}/redis_url` | Redis/Valkey URL | `REDIS_URL` |
| `mi-iptv/{env}/jwt_private_key` | Access/refresh signing key material | `JWT_PRIVATE_KEY` |
| `mi-iptv/{env}/jwt_public_key` | Verification key material | `JWT_PUBLIC_KEY` |
| `mi-iptv/{env}/source_credentials_data_key` | AES-256-GCM DEK for IPTV source credentials at rest (ciphertext in DB) | `SOURCE_CREDENTIALS_DATA_KEY` |
| `mi-iptv/{env}/fcm_service_account_json` | Firebase Admin JSON for companion FCM (INF-034) | `FCM_SERVICE_ACCOUNT_JSON` |
| `mi-iptv/{env}/apns_auth_key_p8` | APNs Auth Key `.p8` (base64) for companion (INF-034) | `APNS_AUTH_KEY_P8_BASE64` |
| `mi-iptv/{env}/apns_key_id` | APNs Key ID | `APNS_KEY_ID` |
| `mi-iptv/{env}/apns_team_id` | Apple Team ID | `APNS_TEAM_ID` |
| `mi-iptv/{env}/apns_topic` | APNs topic / iOS bundle id | `APNS_TOPIC` |
| `mi-iptv/{env}/firebase_crashlytics_ci_service_account_json` | CI upload for Crashlytics symbols (INF-054) | `FIREBASE_CRASHLYTICS_CI_SERVICE_ACCOUNT_JSON` |

Companion push project IDs (non-secret): `docs/infra/034-push-notification-services.md` / `push-notification-projects.json`.

Anonymous crash app ids (non-secret catalog): `docs/infra/054-crash-reporting.md` / `crash-reporting-projects.json`.

In AWS later: Secrets Manager secrets encrypted with the **environment’s** KMS CMK; ECS task definition injects as env or runtime fetch via task role.

## KMS keys (separate per environment)

| Alias | Mock key ARN | Used for |
| --- | --- | --- |
| `alias/mi-iptv-dev-secrets` | `arn:aws:kms:us-east-1:000000000001:key/mock-dev` | DEV Secrets Manager + envelope for source DEK |
| `alias/mi-iptv-qa-secrets` | `arn:aws:kms:us-east-1:000000000002:key/mock-qa` | QA |
| `alias/mi-iptv-prod-secrets` | `arn:aws:kms:us-east-1:000000000003:key/mock-prod` | PROD |

Rules:

- No cross-env key reuse (DEV key must not decrypt PROD ciphertext).
- Key IDs/ARNs referenced via config **names** (`KMS_KEY_ID` / alias), never embedded key material in git.
- Application code talks to a `SecretStore` / `KmsKeyResolver` port — not the AWS SDK in domain/application.

## Per-environment config injection

1. Deploy sets `APP_ENV` and non-secret config (e.g. `PORT`, log level).
2. Secrets are injected from the secret manager into the process environment (mock: local `.env` / shell — agents still must not read `.env*` files).
3. `loadConfig` + `EnvSecretStore` resolve typed config without logging secret values.

## Verification checklist (DoD) — mock complete

- [x] Secret manager model defined (catalog + mock `EnvSecretStore` adapter)
- [x] Per-environment config injection defined (`APP_ENV` + env injection map)
- [x] Separate KMS keys per DEV/QA/PROD (mock aliases/ARNs)

## Live cutover (follow-up)

1. Create real CMKs + aliases in each account; replace mock ARNs in a private ops vault.
2. Create Secrets Manager entries; wire ECS/task role; remove long-lived local secret files from operator machines where possible.
3. Implement approved AWS SDK adapters behind the same ports; keep mock for unit tests.
