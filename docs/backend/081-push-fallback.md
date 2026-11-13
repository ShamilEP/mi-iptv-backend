# BE-081 — Push fallback (FCM / APNs)

- **Status:** Implemented (in review)
- **Refs:** SRS §9; INF-034; BE-075; BE-077 (presence source later)

## Contract

- **Path:** `POST /api/v1/devices/companion-status`
- **Headers (Sprint 0):** `x-account-id`
- **Body:** `{ "status": "connected" | "disconnected" | "pairing_error", "subjectDeviceId"?: uuid }`
- **Response 200:** `{ status, sent, attempted[] }` — never includes push tokens

## Behavior

1. Load active **companion** devices for the account.
2. Skip devices without a push token.
3. Skip devices with an **open realtime socket** (`DeviceSocketPresence` — BE-077 will own live presence).
4. Otherwise send via `PushNotifier` (android → FCM channel, ios → APNs channel).

## Adapters (Sprint 0)

| Port | Adapter |
| --- | --- |
| `PushNotifier` | `InMemoryPushNotifier` (records sends; no vendor SDK) |
| `DeviceSocketPresence` | `InMemoryDeviceSocketPresence` |

### Proposed live packages (not installed)

Live FCM/APNs delivery should use an approved adapter only:

| Option | Package | Notes |
| --- | --- | --- |
| A | `firebase-admin` (propose) | Unified FCM Android + iOS if APNs key uploaded to Firebase |
| B | Node built-ins + HTTP | FCM HTTP v1 + APNs HTTP/2 with INF-034 secrets; no new dependency |

Do **not** import vendor SDKs in domain/application. Install only after explicit human approval.

## Security

- Never log or return raw `pushToken`.
- INF-034 secret names: `FCM_SERVICE_ACCOUNT_JSON`, `APNS_*`.
