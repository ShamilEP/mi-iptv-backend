# App signing material (INF-043)

This directory documents **how** signing assets are managed. It must **never** contain keystores, certificates, or API keys.

## Android (Play App Signing)

1. Create an **upload** keystore offline (or via CI bootstrap on a secure machine).
2. Enable Play App Signing in Play Console (Google holds the app signing key).
3. Base64-encode the upload keystore and store as GitHub Environment secret `ANDROID_KEYSTORE_BASE64`.
4. Store `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` in the same Environment.
5. Rotate upload key via Play Console “Request upload key reset” if compromised; keep a sealed offline copy of the previous keystore until reset completes.

## Apple (distribution + TestFlight)

1. Create a distribution certificate + App Store provisioning profile in the Apple Developer portal.
2. Export `.p12` and profile; store as `APPLE_CERTIFICATE_P12_BASE64` and `APPLE_PROVISIONING_PROFILE_BASE64`.
3. Create an App Store Connect API key (Issuer ID + Key ID + `.p8`); store as `APPLE_API_*` secrets.
4. Renew certificates before expiry; revoke old keys after cutover.

## Play Console automation

1. Create a Google Cloud service account with Play Android Developer API access.
2. Invite the service account email in Play Console → Users and permissions.
3. Store the JSON key as `PLAY_SERVICE_ACCOUNT_JSON` (Environment `beta` / `prod`).
4. Use workflow `distribute-play-internal.yml` for the **internal** testing track.

## TestFlight automation

1. Set `ASC_APP_ID` to the App Store Connect numeric app id.
2. Use workflow `distribute-testflight.yml` on `macos-latest` after INF-041 produces an IPA.

## Forbidden

- Committing `.jks`, `.keystore`, `.p12`, `.p8`, `.mobileprovision`, or Play JSON keys
- Sharing signing passwords in chat/tickets (SEC-003)
