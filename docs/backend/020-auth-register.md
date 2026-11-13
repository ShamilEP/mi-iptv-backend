# BE-020 — POST /auth/register

- **Status:** Implemented (in review)
- **Refs:** US-01; FR-031; Backend §2.1; BE-021; BE-023; BE-029

## Contract

- **Path:** `POST /api/v1/auth/register`
- **Body:** `{ email, password, deviceId }`
  - Backend §2.1 lists email/password; `deviceId` is required here so the 201 token pair is device-bound (Security §2.2 / same as login).
- **Response 201:** `{ accountId, accessToken, refreshToken, expiresIn }`
- **409:** `AUTH_EMAIL_CONFLICT` — email already registered; client should offer login
- **400:** invalid email, missing fields, or `PASSWORD_POLICY_VIOLATION`

## Behavior

1. Normalize + validate email.
2. Enforce password policy (≥8, 1 digit, 1 special) before hashing.
3. Reject duplicate email with a clear conflict code.
4. Insert account (Argon2id hash via BE-021 hasher).
5. Seed MVP default profile (`CreateDefaultProfile` / BE-029).
6. Issue RS256 access + opaque refresh bound to `deviceId` (BE-023).
