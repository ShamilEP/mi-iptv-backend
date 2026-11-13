# INF-043: App signing and distribution

- **Status:** Accepted (Sprint 0)
- **Refs:** SRS §1.3; INF-041; Infra §3.1
- **Task:** INF-043
- **Date:** 2026-11-13

## Goal

Manage **keystore / certificate** material safely, automate uploads to **Google Play Console** and **App Store Connect**, and publish to **beta channels** (Play **internal** testing, **TestFlight**).

## Design

### Keystore and certificate management

| Asset | Storage | Rotation |
| --- | --- | --- |
| Android upload / release keystore | GitHub Actions environment secret `ANDROID_KEYSTORE_BASE64` (+ password/alias secrets) | Annual or on compromise; keep previous keystore offline for Play App Signing upload key reset |
| Apple distribution `.p12` | `APPLE_CERTIFICATE_P12_BASE64` + `APPLE_CERTIFICATE_PASSWORD` | Renew before expiry; import only on `macos-latest` runners |
| Apple provisioning profile | `APPLE_PROVISIONING_PROFILE_BASE64` | Regenerate when App ID / devices change |
| App Store Connect API key | `APPLE_API_KEY_ID`, `APPLE_API_ISSUER_ID`, `APPLE_API_KEY_P8_BASE64` | Rotate in ASC; never commit `.p8` |
| Play Console service account | `PLAY_SERVICE_ACCOUNT_JSON` (JSON key, secret) | Least-privilege Play Developer API; rotate in Google Cloud |

**Hard rules**

1. Never commit `.jks`, `.keystore`, `.p12`, `.p8`, `.mobileprovision`, or Play service-account JSON.
2. Prefer GitHub **Environment** secrets (`beta`, `prod`) over repository-wide secrets.
3. Play App Signing: keep Google-managed app signing key in Play Console; CI holds only the **upload** keystore.
4. Document owner + last rotation date in the team runbook (not in git with secret values).

Operational notes: `.github/signing/README.md`.

### Store automation

| Channel | Workflow | Input artifact | Tooling |
| --- | --- | --- | --- |
| Play **internal** testing | `distribute-play-internal.yml` | Signed AAB (TV or companion) | Google Play Developer API via service account |
| **TestFlight** | `distribute-testflight.yml` | Signed IPA | App Store Connect API (ASC key) on **macOS** |

Orchestrator: `distribute-beta.yml` calls both (skip when secrets/artifacts absent — Sprint 0).

Package-first flow remains INF-041 (`build-package.yml`). Distribution runs on `workflow_dispatch` or `workflow_call` (e.g. from `distribute-beta.yml`) when artifacts + secrets exist.

### Beta channels

| Platform | Track | Audience |
| --- | --- | --- |
| Android TV / companion | Play Console track **`internal`** | Up to 100 internal testers |
| iOS companion | **TestFlight** (internal then external) | ASC testers; external requires Beta App Review |

Promotion to production / App Store review stays a **manual** gate (not automated in Sprint 0).

## Secret names (extend INF-041)

| Name | Purpose |
| --- | --- |
| *(INF-041 Android + Apple signing set)* | Build-time signing |
| `PLAY_SERVICE_ACCOUNT_JSON` | Play Console upload (internal track) |
| `ASC_APP_ID` | App Store Connect numeric app id (TestFlight) |

Package names are workflow **inputs** (defaults `com.miiptv.tv` / `com.miiptv.companion` on `distribute-beta.yml`), not secrets.

## Verification checklist (DoD)

- [x] Keystore / certificate management documented (secrets, rotation, no git material)
- [x] Play Console automation workflow (internal track upload)
- [x] App Store Connect / TestFlight automation workflow (macOS + ASC API)
- [x] Beta channels defined (Play internal, TestFlight)

## Live cutover

1. Create Play service account + grant to the Play Console apps; store JSON as `PLAY_SERVICE_ACCOUNT_JSON`.
2. Create ASC API key; store id/issuer/p8 secrets; set `ASC_APP_ID`.
3. Run INF-041 package workflows to produce AAB/IPA artifacts.
4. Run `distribute-beta.yml` (or per-store workflows) with `environment: beta`.
5. Verify builds appear under Play internal testing and TestFlight.
