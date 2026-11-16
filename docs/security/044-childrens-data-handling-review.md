# SEC-044: Children's data handling review

- **Status:** In review
- **Refs:** FR-023; BE-037; Security §2.1 / §4 / §6; NFR-006; SEC-040
- **Task:** SEC-044
- **Date:** 2026-11-16

## Goal

Assess **kid profiles** and **parental PIN** against child-privacy principles **before enabling them** in Release 1 (DoD).

This is an engineering control review aligned with Security §6 minimization and FR-023. It is **not** legal advice for COPPA / GDPR-K / local statutes.

## Product model under review

| Role | What exists | Child PII? |
| --- | --- | --- |
| Account holder | Adult email + password (SEC-040) | Email only personal data |
| Kid profile | Optional household profile with `kidMode` + content gates | **No** child email, DOB, age, or government id |
| Parental PIN | Gate for parental settings / unlock flows | Secret (hashed); not child identity |

SRS role “Usuario infantil”: restricted optional profile; does **not** manage account or sources. Controls are exercised under the **account holder’s** session.

## Verdict

| Question | Answer |
| --- | --- |
| Collect children’s personal data? | **No** — no age, DOB, child contact, or child-owned accounts |
| Parental PIN safe at rest / in API? | **Yes** — Argon2id `pin_hash`; public views expose `pinConfigured` only |
| PIN abuse controls? | **Yes** — Redis throttle `rl:pin:{accountId}:{profileId}` (5 / 15 min) |
| Content restrictions present? | **Yes** — rating / source gates when metadata exists (`evaluateContentAccess`) |
| Ready to enable kid profiles + PIN? | **Conditionally yes** — enable under residual risks below |

## Assessment matrix

### 1. Data minimization (Security §6) — Pass

| Control | Evidence |
| --- | --- |
| No age / DOB / child contact fields | Schema + SEC-040 “not collected”; `CHILD_DATA_NOT_COLLECTED` in domain |
| Profile `name` is household label | SEC-040 / product policy — not legal name KYC |
| `kidMode` is a preference flag | `profiles.restrictions` JSON — Functional, not identity |
| Account identity remains email-only | `PERSONAL_DATA_FIELD_NAMES = ['email']` |

### 2. Parental PIN as secret — Pass

| Control | Evidence |
| --- | --- |
| Hash only at rest | `app.profiles.pin_hash` (migration `004`); `SetParentalPin` → `hashOpaque` (Argon2id) |
| Never return clear PIN or hash | `ProfilePublicView.pinConfigured`; export omits `pinHash` |
| Shape policy | 4–8 digits (`assertParentalPinPolicy`) |
| Change/clear requires current PIN when set | `PARENTAL_PIN_CURRENT_REQUIRED` |
| Verify throttled | `ParentalPinThrottle` / BE-037 |
| Log redaction | `pin`, `currentPin`, `pin_hash` in `redactLogFields` (hardened in SEC-044) |

### 3. Authorization boundary — Pass

| Control | Evidence |
| --- | --- |
| PIN / restrictions require account access JWT | Parental routes use Bearer + owned profile |
| Child profile cannot own the account | Registration seeds adult account; kid is an additional profile |
| Restrictions syncable only as settings prefs | BE-106 syncable key `restrictions` — still under account sync auth |

### 4. Content gating (FR-023) — Pass with residual risk

| Control | Evidence |
| --- | --- |
| Rating / source restrictions when metadata exists | `evaluateContentAccess` / `EvaluateContentForProfile` |
| Missing metadata fails open on that axis | Documented BE-037 DoD behavior |

**Residual:** Catalog/playback HTTP surfaces must call `EvaluateContentForProfile` before kid-mode content is considered enforced end-to-end (BE-037 follow-up). Until wired, treat client-side filtering as UX only.

### 5. Telemetry / crash — Pass (policy)

QoE / crash must stay dissociated from personal data (Security §6; INF-054). Do **not** attach kid profile names, PIN material, or account email to crash breadcrumbs.

## Explicitly out of scope / not claimed

- Verifiable parental consent flows for child-owned accounts (product does not create child accounts)
- Age gating or DOB collection
- Jurisdiction-specific notice templates / DPA text (product/legal)

## Enablement checklist (before Release 1 flag on)

- [x] No child PII columns or APIs
- [x] Parental PIN hashed + throttled + not exposed
- [x] Kid restrictions model + evaluation helper
- [x] Clear PIN / `currentPin` redacted in structured logs
- [ ] Wire `EvaluateContentForProfile` into catalog listing / playback / search when those backends ship
- [ ] Client: do not solicit child email/DOB; copy presents kid profile as household restriction, not a child account
- [ ] Privacy policy / store listing: describe parental controls under household account (legal)

## Verification checklist (DoD)

- [x] Kid profiles assessed against minimization / no child PII
- [x] Parental PIN assessed against secret handling + throttling
- [x] Enablement verdict recorded with residual risks
