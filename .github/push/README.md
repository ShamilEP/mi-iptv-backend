# Companion push credentials (INF-034)

Operational notes for **FCM** and **APNs** material used by the companion. Values never belong in git.

## Secret names

| Name | Purpose |
| --- | --- |
| `FCM_SERVICE_ACCOUNT_JSON` | Firebase Admin service account JSON (server send) |
| `APNS_AUTH_KEY_P8_BASE64` | Apple APNs Auth Key (`.p8`) base64-encoded |
| `APNS_KEY_ID` | APNs Key ID |
| `APNS_TEAM_ID` | Apple Developer Team ID |
| `APNS_TOPIC` | iOS bundle id / APNs topic (`com.miiptv.companion`) |

Non-secret: `FCM_PROJECT_ID` from `docs/infra/push-notification-projects.json` per environment.

Prefer GitHub **Environment** secrets (`dev` / `qa` / `prod`) mirroring INF-013 Secrets Manager paths `mi-iptv/{env}/…`.

## Forbidden in this repository

- Firebase Admin JSON / private keys
- APNs `.p8` / `.p12` files
- Raw device `push_token` values in logs, fixtures, or docs
- Committing companion `google-services.json` / `GoogleService-Info.plist` into the **backend** repo (those stay in the companion app repo)

## Rotation

1. Rotate FCM service account in Google Cloud; update `FCM_SERVICE_ACCOUNT_JSON`.
2. Create a new APNs Auth Key in Apple Developer; update `.p8` + `APNS_KEY_ID`; revoke the old key after cutover.
3. Re-upload the APNs key to Firebase if using unified FCM iOS delivery.
