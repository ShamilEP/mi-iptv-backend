# BE-029 — Auto-create the default profile on registration

- **Status:** Implemented (in review)
- **Refs:** FR-002; SRS §1.2; BE-010; consumed by BE-020

## Behavior

After a new account row is inserted, registration must call `CreateDefaultProfile`:

1. Reject when the account already has any profile (`PROFILE_ALREADY_EXISTS`) — MVP = one profile.
2. Insert exactly one `isDefault: true` profile seeded with language and playback defaults.

## Seed defaults (aligned with `app.profiles`)

| Field | Value |
| --- | --- |
| `name` | `Default` |
| `language` | `es` (BCP-47 placeholder until PRD-012) |
| `autoplay` | `true` |
| `subtitlePrefs` | `{}` |
| `restrictions` | `{}` |
| `region` / `avatar` | `null` |
| `isDefault` | `true` |

## Wiring

- Domain factory: `buildDefaultProfile` (`src/domain/profiles/default-profile.ts`)
- Use case: `CreateDefaultProfile` (`src/application/profiles/create-default-profile.ts`)
- Composition root exposes `createDefaultProfile` for **BE-020** `POST /auth/register` (no public profile HTTP route in this task)

## Out of scope

- `POST /auth/register` itself → **BE-020**
- Multi-profile APIs, parental PIN, FR-002 client preference updates
