# BE-040: Source Registry CRUD

- **Status:** Accepted (Sprint 0)
- **Refs:** FR-024; Backend §2.2; BE-010; BE-042
- **Task:** BE-040
- **Date:** 2026-11-12

## Goal

Expose `/api/v1/sources` CRUD for **M3U** and **Xtream**: add, list, edit, prioritize, deactivate, and delete. Responses never include clear credentials (BE-042 masking).

## Endpoints

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/api/v1/sources` | List non-deleted sources for the account |
| `POST` | `/api/v1/sources` | Create M3U/Xtream (`uriRef` + optional/required credentials) |
| `PATCH` | `/api/v1/sources/{id}` | Edit name/uriRef, set `priority`, set `enabled` (deactivate), rotate credentials |
| `DELETE` | `/api/v1/sources/{id}` | Soft-delete (tombstone); wipe ciphertext |

Auth stand-in: header `x-account-id` until JWT (BE-023). SSRF validation of `uriRef` is **BE-041**.

## Persistence

Sprint 0 still uses `InMemorySourceRepository`. **`pg` is approved** — wire a `SourceRepository` adapter over `RelationalDatabase` when replacing in-memory persistence (`docs/dev/proposed-packages-BE-007.md`).

## Verification checklist (DoD)

- [x] POST/GET/PATCH/DELETE `/api/v1/sources`
- [x] Edit, priority, and disable via PATCH
- [x] Credentials encrypted at rest (in-memory ciphertext) and masked on GET/POST/PATCH responses
