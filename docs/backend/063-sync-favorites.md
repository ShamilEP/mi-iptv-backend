# BE-063 — GET/POST /sync/favorites

- **Status:** Implemented (in review)
- **Refs:** US-06; FR-020; ADR-005; BE-060 domain

## Contract

- **GET** `/api/v1/sync/favorites` — headers `x-account-id`, `x-profile-id`; returns active (non-tombstoned) favorites for that profile ordered by `sortOrder`, `createdAt`.
- **POST** `/api/v1/sync/favorites` — headers `x-account-id`, `x-profile-id`, `x-device-id`; body ADR-005 (`clientEventId`, `itemId`, `action`, `syncVersion`) plus optional `type`, `sortOrder`, `clientReportedAt`.

## Behavior

1. Idempotent on `(accountId, clientEventId)`.
2. Always accepts writes; `resolvedBy=lww` when client `syncVersion` ≠ server row.
3. `remove` soft-deletes (`deletedAt`); `add` clears the tombstone.
4. `sortOrder` updates when provided; otherwise preserves existing / defaults to `0`.
5. Response includes `conflict` for the Sync Conflict notice when `resolvedBy` ≠ `accepted` (BE-065).
