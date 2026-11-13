# INF-034: Push notification services (companion)

- **Status:** Accepted (Sprint 0 **mock** — no live Firebase/Apple console apply)
- **Refs:** SRS §9 (companion notifications); INF-001; INF-013; devices `push_token`
- **Task:** INF-034
- **Mock date:** 2026-11-13

## Goal

Stand up **FCM** (Android companion) and **APNs** auth keys (iOS companion) so the backend can later wake or notify the companion without committing key material.

## Design

| Concern | Choice |
| --- | --- |
| Android companion | **Firebase Cloud Messaging (FCM)** project per env |
| iOS companion | **APNs Auth Key** (`.p8`, Key ID + Team ID) — preferred over legacy `.p12` certs |
| Unified send (optional) | Upload the same APNs Auth Key into the Firebase iOS app so one FCM Admin path can fan out Android + iOS |
| Backend delivery | Later BE task behind a `PushNotifier` port; Sprint 0 only provisions project + secret **names** |
| Device tokens | Already stored on `devices.push_token` (never returned from APIs — SEC-040) |

Realtime companion↔TV **commands** remain WebSocket/Redis (BE-077/078). Push covers **basic status** wakes (TV connected/disconnected, pairing errors) per SRS §9 when the companion is backgrounded.

### FCM project (per environment)

| Env | Mock Firebase project ID | Notes |
| --- | --- | --- |
| `dev` | `mi-iptv-companion-dev` | CI / internal companion builds |
| `qa` | `mi-iptv-companion-qa` | Staging |
| `prod` | `mi-iptv-companion-prod` | Production |

Each project registers an Android app with package `com.miiptv.companion` (aligns with INF-043 defaults). Client `google-services.json` lives in the **companion** repo, not this backend.

Backend needs a **Firebase Admin** service account JSON (server) — never the client config alone.

### APNs keys (companion)

| Asset | Storage (secret **name**) | Rotation |
| --- | --- | --- |
| APNs Auth Key `.p8` | `APNS_AUTH_KEY_P8_BASE64` | Create in Apple Developer → Keys; revoke on compromise |
| Key ID | `APNS_KEY_ID` | Ties to the `.p8` |
| Team ID | `APNS_TEAM_ID` | Apple Developer Team |
| Topic / bundle id | `APNS_TOPIC` (default `com.miiptv.companion`) | Must match the iOS App ID |

**Hard rules**

1. Never commit `.p8`, APNs `.p12`, Firebase Admin JSON, or raw push tokens in git.
2. Prefer GitHub **Environment** secrets (`dev` / `qa` / `prod`) and/or INF-013 Secrets Manager entries.
3. Do not log `push_token` or FCM/APNs payloads containing tokens.
4. Mock Key IDs / Team IDs in `push-notification-projects.json` are placeholders only.

Operational notes: `.github/push/README.md`. Catalog: `docs/infra/push-notification-projects.json`.

### Secret manager catalog (extends INF-013)

| Secret name | Env injection | Purpose |
| --- | --- | --- |
| `mi-iptv/{env}/fcm_service_account_json` | `FCM_SERVICE_ACCOUNT_JSON` | Firebase Admin SDK credentials |
| `mi-iptv/{env}/apns_auth_key_p8` | `APNS_AUTH_KEY_P8_BASE64` | APNs Auth Key (base64) |
| `mi-iptv/{env}/apns_key_id` | `APNS_KEY_ID` | APNs Key ID |
| `mi-iptv/{env}/apns_team_id` | `APNS_TEAM_ID` | Apple Team ID |
| `mi-iptv/{env}/apns_topic` | `APNS_TOPIC` | Bundle id / APNs topic |

Non-secret config (safe in tfvars / app config): `FCM_PROJECT_ID` from the JSON catalog per `APP_ENV`.

### Verification checklist (DoD) — mock complete

- [x] FCM project defined per env (mock IDs + Android package registration plan)
- [x] APNs keys defined (Auth Key secret names + Key ID / Team ID / topic)

## Live cutover

1. Create Firebase projects (or one project with env suffixes) in Google Cloud matching the catalog IDs; enable Cloud Messaging.
2. Add Android app `com.miiptv.companion`; distribute `google-services.json` only to the companion repo.
3. Create a Firebase Admin service account with Cloud Messaging send permission; store JSON as `FCM_SERVICE_ACCOUNT_JSON` / Secrets Manager path above.
4. In Apple Developer, create an **APNs Auth Key**; store `.p8` + Key ID + Team ID secrets; set `APNS_TOPIC=com.miiptv.companion`.
5. (Recommended) Upload the APNs Auth Key into the Firebase iOS app for unified FCM delivery.
6. Companion registers FCM/APNs device tokens via existing device register/heartbeat (`pushToken`); backend send adapter lands in a later BE task.
