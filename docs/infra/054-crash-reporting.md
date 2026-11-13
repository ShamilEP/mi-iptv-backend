# INF-054: Crash reporting (TV + companion)

- **Status:** Accepted (Sprint 0 **mock** — no live Firebase Crashlytics console apply)
- **Refs:** NFR-008; Security §6; SEC-003; INF-001; INF-034 (shared Firebase projects)
- **Task:** INF-054
- **Mock date:** 2026-11-13

## Goal

Enable **anonymous crash reporting** for the **Android TV** app and the **companion** (Android + iOS) so operators can diagnose client failures without collecting personal data.

## Design

| Concern | Choice |
| --- | --- |
| Provider | **Firebase Crashlytics** (same per-env Firebase projects as INF-034 FCM) |
| TV | Android TV app `com.miiptv.tv` |
| Companion | Android `com.miiptv.companion` + iOS bundle `com.miiptv.companion` |
| Identity | **Anonymous** installation / session ids only (NFR-008 / Security §6) |
| Backend role | Document projects, CI symbol-upload secret **names**, scrubbing rules — SDKs live in client repos |

NFR-008 requires structured logs, crash reporting, and QoE with **anonymous session correlation**. Crashlytics covers client crashes; backend structured logs remain `JsonConsoleLogger` (SEC-003).

### Anonymity rules (mandatory)

Crash and breadcrumb payloads **must**:

1. Use opaque `anonymousInstallationId` / `anonymousSessionId` (or Crashlytics installation id) — **never** `email`, `accountId`, or JWT subjects.
2. Scrub headers/cookies/bodies of tokens, passwords, and IPTV source credentials before upload (SEC-003 §3.4).
3. Disable automatic capture of network request bodies that may contain credentials.
4. Omit push tokens, keystore material, and `.env` contents from tickets / custom keys.

Allowed technical context: app version, OS version, device model class, stack traces, non-PII feature flags.

### Per-environment Firebase apps (mock)

Reuse INF-034 project ids; register separate Firebase **apps** for TV vs companion:

| Env | Project | TV app id (mock) | Companion Android | Companion iOS |
| --- | --- | --- | --- | --- |
| `dev` | `mi-iptv-companion-dev` | `…:android:tvdev` | `…:android:companiondev` | `…:ios:companiondev` |
| `qa` | `mi-iptv-companion-qa` | `…:android:tvqa` | `…:android:companionqa` | `…:ios:companionqa` |
| `prod` | `mi-iptv-companion-prod` | `…:android:tvprod` | `…:android:companionprod` | `…:ios:companionprod` |

Catalog: `docs/infra/crash-reporting-projects.json`.

Client `google-services.json` / `GoogleService-Info.plist` stay in the **TV** and **companion** repositories — not this backend.

### CI symbol / mapping upload (secret names)

Release builds should upload ProGuard/R8 mapping files (Android) and dSYMs (iOS) so stacks are readable:

| Secret name | Purpose |
| --- | --- |
| `FIREBASE_CRASHLYTICS_CI_SERVICE_ACCOUNT_JSON` | CI identity for Crashlytics artifact upload |
| `FIREBASE_APP_ID_TV` | Android TV Firebase App Id |
| `FIREBASE_APP_ID_COMPANION_ANDROID` | Companion Android Firebase App Id |
| `FIREBASE_APP_ID_COMPANION_IOS` | Companion iOS Firebase App Id |

Prefer GitHub **Environment** secrets (`dev` / `qa` / `prod`). Logical Secrets Manager paths (INF-013): `mi-iptv/{env}/firebase_crashlytics_ci_service_account_json` (and app id config as non-secret when possible).

### Client SDK placement (not this repo)

| App | Suggested SDK | Notes |
| --- | --- | --- |
| Android TV / companion Android | Firebase Crashlytics (Gradle) | Wire in TV/companion Android projects (INF-041 `apps/` or sibling repos) |
| Companion iOS | Firebase Crashlytics (SwiftPM/CocoaPods) | Same Firebase project as companion Android per env |

**Proposed packages (client repos only — do not add to this backend):** Firebase Crashlytics Android/iOS SDKs. Backend stays free of crash vendor SDKs unless a future server-side reporter is approved separately.

### Verification checklist (DoD) — mock complete

- [x] Anonymous crash reporting plan for the **TV** app
- [x] Anonymous crash reporting plan for the **companion** (Android + iOS)

## Live cutover

1. In each Firebase project, create Android TV + companion Android + companion iOS apps matching package/bundle ids.
2. Enable Crashlytics; distribute client config files only to client repos.
3. Configure Crashlytics data collection with custom keys limited to anonymous ids; verify email/accountId are never set.
4. Store CI upload service account + app ids as Environment secrets; upload mappings/dSYMs from INF-041 package workflows.
5. Trigger a test non-fatal / fatal in `dev`; confirm the report has no PII/secrets in the Firebase console.
