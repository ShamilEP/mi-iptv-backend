# ADR-004: JWT access-token TTL and signing algorithm

- **Status:** Accepted
- **Date:** 2026-11-12
- **Deciders:** Product (PRD-021)
- **Refs:** Backend §2.1; Security §2.2; NFR-013; BE-023

## Context

Backend API examples return `expiresIn: 3600` (60 minutes). Security §2.2 allows access-token lifetime **15–60 minutes** and either **RS256** or **HS256**. BE-023 needs one algorithm and one TTL before login/JWT work can proceed (and before BE-121 can cover auth endpoints).

## Decision

| Concern | Choice |
| --- | --- |
| Access-token TTL | **3600 seconds (60 minutes)** — matches Backend §2.1 `expiresIn` |
| Signing algorithm | **RS256** (asymmetric) with **`kid`** in the JWT header |
| Key material | Private signing key + public verify key from the secret manager / KMS-backed injection (per env); rotation by publishing a new `kid` |
| Refresh token | **30 days**, hashed at rest in PostgreSQL, **bound to `deviceId`** (Security §2.2; schema `app.refresh_tokens`) |

HS256 is **not** used for MVP access tokens.

## Consequences

- Auth responses keep `"expiresIn": 3600`.
- Clients verify with the JWKS / public key for the active `kid`; servers sign with the matching private key.
- Security and Backend specs must state RS256 + 3600 s explicitly (no “RS256 or HS256” ambiguity).
- Unblocks **BE-023** → **BE-022** (login) → auth coverage in **BE-121**.

## Rejected for MVP

- **HS256** — simpler ops, but weaker key-distribution story for multiple verifiers and harder rotation hygiene.
- **15-minute access TTL** — valid under Security, but contradicts published Backend examples; prefer one contract.
- Access TTL longer than 60 minutes — outside Security §2.2.
