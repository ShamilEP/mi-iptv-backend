# SEC-051: Mobile static analysis checklist

- **Refs:** Security §3.2; SEC-003 §§3.2–3.3; INF-041
- **Task:** SEC-051
- **Scope:** Android TV + Companion (out-of-tree clients)

## When to run

| Trigger | Tooling |
| --- | --- |
| PR / push when `apps/android-tv` present | Android Lint (`./gradlew lint`) via `.github/workflows/mobile-static-analysis.yml` |
| PR / push when companion Flutter/Dart tree present | `dart analyze` / Flutter analyzer via same workflow |
| Pre-release APK / IPA available | MobSF (or org-approved equivalent) static scan — **client CI**, not this backend repo |

## Android TV (Security §3.2)

- [ ] Session JWT / refresh stored only in **EncryptedSharedPreferences** or **Android Keystore**-backed storage
- [ ] No JWT, refresh token, source password, or DEK written to **Logcat** (debug builds included)
- [ ] Lint / static analysis: no hardcoded secrets; network cleartext traffic disabled except documented debug exception
- [ ] Crash / analytics SDKs scrub `Authorization` and credential fields

## Companion (iOS / Android)

- [ ] Tokens and pairing material in **Keychain** (iOS) / **Keystore** (Android)
- [ ] Same Logcat / console secret ban as TV
- [ ] Analyzer clean for secret-looking string literals in app sources
- [ ] Crash SDK network body capture disabled or scrubbed

## Backend coordination

- Clients must treat API source views as **already masked** (`password` / `username` / `token` null); never log raw create/update request bodies that include credentials.
- Pairing / send-to-TV flows must not embed long-lived account passwords in deep links.

## Status in this repository

| Item | Status |
| --- | --- |
| Checklist published | Done (SEC-051) |
| Conditional Lint / analyze workflow | Done (skips when apps absent) |
| MobSF on release APK/IPA | Deferred to client packaging pipelines |
