# INF-041: Build and package workflows

- **Status:** Accepted (Sprint 0)
- **Refs:** Infra §3.1; INF-005; INF-040
- **Task:** INF-041
- **Date:** 2026-11-13

## Goal

Automate **build and package** pipelines for:

1. Backend **Docker images**
2. **Android TV** APK + AAB
3. **Companion** Android AAB + iOS IPA (**macOS runners** + signing)

## Design

| Artifact | Workflow | Runner | Notes |
| --- | --- | --- | --- |
| Docker image | `container-image.yml` (reusable) | `ubuntu-latest` | Build → Trivy → optional ECR push (INF-005) |
| Android TV APK/AAB | `package-android-tv.yml` | `ubuntu-latest` | Gradle `assembleRelease` + `bundleRelease` |
| Companion AAB | `package-companion.yml` job `package-aab` | `ubuntu-latest` | Gradle `bundleRelease` |
| Companion IPA | `package-companion.yml` job `package-ipa` | **`macos-latest`** | Import cert/profile; `build-ipa.sh` or Xcode |
| Orchestrator | `build-package.yml` | calls the above | Push to `main`/`develop`/`release/**`, tags `v*`, manual |

TV/companion source trees are expected under `apps/` **or** in sibling repos that `workflow_call` these templates. When paths are missing, package jobs **skip with a message** (Sprint 0) instead of failing the backend Docker path.

### Signing (secret **names** only — never commit material)

| Secret name | Used by |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | TV + companion Android |
| `ANDROID_KEYSTORE_PASSWORD` | TV + companion Android |
| `ANDROID_KEY_ALIAS` | TV + companion Android |
| `ANDROID_KEY_PASSWORD` | TV + companion Android |
| `APPLE_CERTIFICATE_P12_BASE64` | Companion IPA |
| `APPLE_CERTIFICATE_PASSWORD` | Companion IPA |
| `APPLE_PROVISIONING_PROFILE_BASE64` | Companion IPA |
| `APPLE_API_KEY_ID` | Companion IPA (App Store Connect API) |
| `APPLE_API_ISSUER_ID` | Companion IPA |
| `APPLE_API_KEY_P8_BASE64` | Companion IPA |

Store values in GitHub Actions **environment** secrets for the app repos / this monorepo. Do not put keystores, `.p12`, or `.p8` files in git.

### Docker packaging

Reuses INF-005: multi-stage non-root `Dockerfile`, Trivy HIGH/CRITICAL gate, optional ECR publish when `AWS_ROLE_ARN` + `ECR_REGISTRY` are set. `build-package.yml` calls `container-image.yml` via `workflow_call`.

## Verification checklist (DoD)

- [x] Docker images workflow (reusable + orchestrated)
- [x] Android TV APK/AAB packaging workflow
- [x] Companion AAB packaging workflow
- [x] Companion IPA packaging on **macOS** runners with signing secret contract

## Live cutover

1. Add `apps/android-tv` and `apps/companion/{android,ios}` **or** copy/call workflows from those repos.
2. Configure signing secrets in GitHub Environments (names above).
3. Provide `build-ipa.sh` (or wire `xcodebuild` scheme) in the iOS project.
4. Enable ECR push vars for Docker publish (INF-005).
5. Store distribution / beta uploads: **INF-043** (`docs/infra/043-app-signing-distribution.md`).
