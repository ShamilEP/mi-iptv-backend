# Runbook: Key and credential compromise (INF-062)

**Audience:** Platform / Security on-call  
**Applies to:** JWT signing keys, source-credential DEK/CMK, Redis AUTH, companion push keys  
**Safety:** Never paste PEMs, DEKs, AUTH tokens, FCM JSON, or APNs `.p8` into chat/tickets. Reference INF-013 secret **names** only. Prefer OIDC; rotate any human credentials used during response.

## Severity and contain-first

1. Open SEV-1/2 incident; restrict who can read Secrets Manager / KMS in the env.
2. **Contain** before rotate: disable leaked IAM users/keys, revoke suspicious refresh families if account takeover is suspected (BE-025 revoke-all paths).
3. Identify **which class** of secret leaked (table below); follow only that section plus “Always”.

## Always (every class)

1. Record ticket id, env, discovery time (UTC), blast-radius hypothesis — **no secret values**.
2. Rotate the compromised secret in Secrets Manager (new version); keep previous version readable only for the dual-read window when required.
3. Force ECS new deployment so tasks load the new injection.
4. Invalidate sessions as required by the class.
5. Audit CloudTrail / app logs for abuse window; preserve evidence.
6. Close with postmortem; schedule rotation drill if process gaps found.

## A. JWT access signing key (`JWT_*` / `mi-iptv/{env}/jwt_*`)

Refs: ADR-004; SEC-011; BE-023.

1. Generate a new RSA key pair; assign a **new** `JWT_KEY_ID` (`kid`).
2. Publish previous public key into `JWT_PREVIOUS_PUBLIC_KEYS` so in-flight access tokens still verify until TTL (≤ 3600 s).
3. Update `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` / `JWT_KEY_ID` secrets; deploy.
4. After access TTL + buffer, remove the compromised kid from previous-keys map.
5. Optionally revoke all refresh tokens for the env (hashed rows in Postgres) if the attacker may have minted sessions — prefer targeted account revoke when scope is known.
6. Confirm new access tokens carry the new `kid`; old `kid` still verifies only while listed in previous keys.

## B. Source-credential DEK / CMK

Refs: INF-023; BE-042; SEC-030 (`DualReadSourceCredentialCipher`).

### B1. DEK compromise (`SOURCE_CREDENTIALS_DATA_KEY`)

1. Issue a **new** DEK in Secrets Manager (CMK-wrapped).
2. Deploy **dual-read** (primary = new, previous = old).
3. Batch re-encrypt `user_sources.credentials_encrypted` (SEC-030 drill steps).
4. Verify sample decrypt + API still **masks** secrets.
5. Drop previous DEK; redeploy primary-only.
6. If ciphertext may have left the boundary, treat stored IPTV source passwords as exposed to operators who held the DEK — notify account owners to rotate **provider** credentials where feasible (never log clear source passwords).

### B2. CMK compromise or unauthorized decrypt

1. **Disable** the env CMK (break-glass) to stop further Decrypt/GenerateDataKey.
2. Create a replacement CMK + alias plan for the env; update IAM task-role allowlist (INF-023).
3. Issue a new DEK under the new CMK; dual-read / re-encrypt as B1 (ciphertext must be re-wrapped).
4. Schedule CMK deletion only after retention policy and legal hold checks.
5. Review CloudTrail `Decrypt` / `GenerateDataKey` for the abuse window.

## C. Redis AUTH token (`REDIS_URL` / session + cache)

Refs: INF-022.

1. Rotate ElastiCache AUTH token; update `mi-iptv/{env}/redis_url` and cache URL secrets.
2. Rolling restart ECS tasks so clients reconnect with the new AUTH.
3. Deny-list / presence / pub/sub are ephemeral — expect brief reconnect blips; refresh tokens remain in Postgres.
4. If an attacker held AUTH, assume deny-list could be cleared: rely on short access TTL + refresh revoke if account compromise is also suspected.

## D. Companion push keys (FCM / APNs)

Refs: INF-034.

1. Rotate FCM service account and/or APNs Auth Key in the provider consoles.
2. Update `mi-iptv/{env}/fcm_*` and `apns_*` secret names; redeploy.
3. Push tokens in DB are device identifiers — not provider signing keys; still audit for spam sends during the window.
4. Confirm a test push on qa before prod.

## E. App signing / store keys

Refs: INF-043.

1. Follow Play / Apple compromise procedures in the store consoles (outside this repo).
2. Never commit keystores; rotate CI secrets that hold upload keys.
3. Document owner + rotation time in the private ops channel.

## Decision aid

| Symptom | Likely class |
| --- | --- |
| Forged access JWTs / unexpected `kid` | A |
| Clear IPTV passwords in logs or DB export | B (+ logging incident) |
| Unauthorized Redis writes / pub/sub spam | C |
| Unexpected pushes to devices | D |

## Post-incident

- Confirm no secret values in git, tickets, or ChatOps history.
- Update rotation dates; consider shortening dual-read windows next time.
