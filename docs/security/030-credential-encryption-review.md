# SEC-030: Review credential encryption

- **Status:** Reviewed (awaiting approval)
- **Refs:** Security §5; BE-042; INF-023
- **Task:** SEC-030
- **Date:** 2026-11-12

## Goal

Confirm IPTV source credentials at rest use **AES-256-GCM**, **KMS-managed** keys,
**least-privilege IAM**, and that a **DEK rotation drill** is defined and executable.

## Findings (DoD)

| Control | Result | Evidence |
| --- | --- | --- |
| AES-256-GCM | **Pass** | `Aes256GcmSourceCredentialCipher` uses `aes-256-gcm`, 12-byte IV, 16-byte tag, v1 framing |
| KMS-managed keys | **Pass** | Per-env CMK catalog (INF-023); DEK via `SOURCE_CREDENTIALS_DATA_KEY` (Secrets Manager → CMK-wrapped) |
| Least-privilege IAM | **Pass** | Task-role allowlist on env CMK + DEK secret ARN; deny cross-key; CI DescribeKey-only; no human PROD decrypt by default |
| Rotation drill | **Pass** | Procedure below + `DualReadSourceCredentialCipher` unit drill |

## Hardening applied in this review

1. **Fail closed outside `dev`:** composition root requires `SOURCE_CREDENTIALS_DATA_KEY` when `APP_ENV` ≠ `dev` (ephemeral random DEK only for local Sprint 0).
2. **IAM stubs:** task role scoped to CMK ARN + DEK secret; CI role may only `DescribeKey` (deny Encrypt/Decrypt/GenerateDataKey).
3. **Rotation helper:** `DualReadSourceCredentialCipher` + `reencryptSourceCredentialCiphertext` for dual-read cutover.

## Rotation drill (DEK)

Run in a controlled environment (never on prod without change ticket).

1. **Issue new DEK** in Secrets Manager (CMK-encrypted); keep previous version readable.
2. **Deploy dual-read:** primary = new DEK, previous = old DEK (`DualReadSourceCredentialCipher`).
3. **Re-encrypt batch:** for each `user_sources.credentials_encrypted`, `reencryptSourceCredentialCiphertext` → write new ciphertext + `enc_key_id`.
4. **Verify:** sample decrypt with primary-only cipher; API still masks secrets.
5. **Drop previous DEK** from Secrets Manager / task env after dual-read window.
6. **Record:** ticket id, row counts, start/end times (ops runbook; no secrets in git).

Automated evidence: `tests/unit/dual-read-source-credential-cipher.test.ts`.

## Residual risks

- Live AWS CMKs / IAM attach still deferred (INF-023 mock posture).
- Per-row `GenerateDataKey` envelope remains a future upgrade behind the same port.
- Emergency break-glass CMK disable stays in private ops runbook (not in repo).

## Verification checklist (DoD)

- [x] AES-256-GCM confirmed in code + tests
- [x] KMS-managed key model (CMK + DEK) confirmed
- [x] Least-privilege IAM stubs reviewed/hardened
- [x] Rotation drill documented and unit-tested
