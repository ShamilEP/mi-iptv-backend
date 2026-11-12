# BE-042: Encrypt source credentials (AES-256-GCM + KMS)

- **Status:** Accepted (Sprint 0)
- **Refs:** Security §5; NFR-005; INF-023; INF-013
- **Task:** BE-042
- **Date:** 2026-11-12

## Goal

Encrypt IPTV source credentials at rest with **AES-256-GCM**, using a **KMS-managed** data key, ensure API GET responses **never** return clear secrets, and document **key rotation**.

## Envelope model

```
plaintext secrets (username/password/token)
        │
        ▼  AES-256-GCM (node:crypto)
credentials_encrypted BYTEA  +  enc_key_id
        ▲
        │  DEK = SOURCE_CREDENTIALS_DATA_KEY (32 bytes, base64)
        │
AWS KMS CMK (per env, INF-023) protects the DEK via Secrets Manager
```

| Layer | Asset | Where |
| --- | --- | --- |
| CMK | `alias/mi-iptv-{env}-source-credentials` | KMS (mock catalog today) |
| DEK | `SOURCE_CREDENTIALS_DATA_KEY` | Secrets Manager → task env |
| Ciphertext | `app.user_sources.credentials_encrypted` | PostgreSQL BYTEA |
| Key reference | `app.user_sources.enc_key_id` | CMK ARN / DEK version id |

Sprint 0 uses a long-lived DEK injected from Secrets Manager (itself KMS-encrypted). Live cutover may switch to per-row `GenerateDataKey` while keeping the same ciphertext framing and `SourceCredentialCipher` port.

## API masking (GET)

`maskSourceSecretsForApi` is mandatory for any source DTO leaving the API:

- `password` / `token` / `username` → always `null` in responses
- `credentialsConfigured` → `true` when ciphertext exists

Clear secrets must never appear in OpenAPI examples, logs, or sync deltas (sync already omits ciphertext — BE-010).

## Key rotation

Documented in INF-023; summary for BE-042 operators:

| Asset | Schedule | Application action |
| --- | --- | --- |
| CMK | Automatic annual (AWS) | None (alias/ARN stable) |
| DEK | Every **365 days** or on compromise | Issue new `SOURCE_CREDENTIALS_DATA_KEY`; dual-read old/new; re-encrypt rows; drop old DEK |
| Emergency | Immediate | Disable CMK grant + rotate DEK; re-encrypt all `user_sources` |

`CredentialEncryptionKeyCatalog.rotationIntervalDays` exposes the DEK policy (365) to the composition root.

Operational dual-read / re-encrypt drill: **SEC-030** (`docs/security/030-credential-encryption-review.md`, `DualReadSourceCredentialCipher`).

## Code map

| Concern | Location |
| --- | --- |
| Port | `src/application/ports/source-credential-cipher.ts` |
| AES-GCM adapter | `src/infrastructure/crypto/aes256-gcm-source-credential-cipher.ts` |
| GET masking | `src/application/sources/mask-source-secrets-for-api.ts` |
| KMS catalog | INF-023 `CredentialEncryptionKeyCatalog` |

## Verification checklist (DoD)

- [x] Envelope encryption (AES-256-GCM + KMS-managed DEK)
- [x] Secrets never returned by API (masked helper)
- [x] Key rotation documented (this doc + INF-023)
