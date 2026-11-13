# Client crash reporting (INF-054)

Operational notes for **anonymous** Firebase Crashlytics on Android TV and companion. Values never belong in the backend git tree.

## Secret names (CI symbol / dSYM upload)

| Name | Purpose |
| --- | --- |
| `FIREBASE_CRASHLYTICS_CI_SERVICE_ACCOUNT_JSON` | Service account for Crashlytics uploads |
| `FIREBASE_APP_ID_TV` | Android TV Firebase App Id |
| `FIREBASE_APP_ID_COMPANION_ANDROID` | Companion Android Firebase App Id |
| `FIREBASE_APP_ID_COMPANION_IOS` | Companion iOS Firebase App Id |

Prefer GitHub **Environment** secrets (`dev` / `qa` / `prod`).

## Forbidden in this repository

- Firebase Admin / Crashlytics CI JSON keys
- Client `google-services.json` / `GoogleService-Info.plist` for TV or companion
- Crash fixtures that embed email, account ids, tokens, or source credentials

## Anonymity checklist

1. Crash custom keys: anonymous installation/session ids only.
2. Never set Crashlytics user id to email or account UUID.
3. Scrub breadcrumbs of Authorization headers and IPTV credentials (SEC-003).
4. Confirm a sample `dev` crash in the console contains no PII before enabling `prod`.
