# BE-120 — Domain unit tests

- **Status:** Implemented
- **Refs:** SRS §22; Security §2.1–§2.2; BE-060

## Coverage map

| DoD area | Primary tests |
| --- | --- |
| Conflict-resolution branches | `tests/unit/domain-logic-coverage-be120.test.ts` + `sync-domain.test.ts` |
| Idempotency | `domain-logic-coverage-be120.test.ts` (`replayIfDuplicate`, decide* replay) |
| Normalizers | `domain-logic-coverage-be120.test.ts`, `account-email.test.ts`, `favorite-domain.test.ts` (+ existing catalog/source suites) |
| Password policy | `password-policy.test.ts` + `src/domain/auth/password-policy.ts` |
| Token rules | `access-token-rules.test.ts` + `src/domain/auth/access-token-rules.ts` (wired into RS256 adapter) |
