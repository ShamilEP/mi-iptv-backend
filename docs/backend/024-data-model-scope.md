# Relational data model scope (PRD-024 / ADR-006)

- **Status:** Accepted (Product)
- **Refs:** Backend §5.1; SRS §6–7; ADR-006; BE-010; BE-011

§5.1 lists the **core five** tables. The physical schema also includes at least:

- `app.favorites`
- `app.sync_events` (SRS “sync_log”)
- `app.password_reset_tokens`
- `app.refresh_tokens`

MVP settings live on `app.profiles` JSON columns unless BE-011 adds a dedicated syncable settings table.
