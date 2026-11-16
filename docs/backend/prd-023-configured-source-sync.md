# Configured source sync (PRD-023 / ADR-009)

- **Status:** Accepted (Product)
- **Refs:** FR-033; Backend §2.2–2.3; ADR-009; ADR-005; BE-062; BE-064; BE-040

| Item | Value |
| --- | --- |
| Delta pull | **`GET /sync/state?cursor=`** includes `entity: "source"` |
| Mutations | **`/sources` CRUD only** (no `/sync/sources`, no source in `/sync/events`) |
| Secrets | Never in deltas or API responses |
| Full list | `GET /sources` |

Implementation: **BE-062** (delta HTTP) + **BE-064** (source sync semantics on CRUD).

Note: numbered `023-*.md` is reserved for **BE-023** JWT issuance (`023-jwt-issuance-and-keys.md`).
