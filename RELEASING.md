# Releasing BrainBar

This guide is for maintainers preparing public BrainBar releases.

## Public Release Shape

Release tags publish a Developer ID signed and Apple-notarized `BrainBar.dmg`.

The release workflow:

1. Runs public-safety, graph runtime, and Xcode tests.
2. Imports the Developer ID Application certificate into a temporary CI keychain.
3. Builds and signs `BrainBar.app` with hardened runtime.
4. Submits the app to Apple notarization.
5. Staples and validates the notarization ticket.
6. Builds `BrainBar.dmg`.
7. Mounts the DMG and verifies the app with `codesign`, `stapler`, and `spctl`.
8. Publishes the DMG to the GitHub Release.

The separate `Verify Release DMG` workflow can be run after publication to download the public release asset on a clean macOS runner and validate it again.

## Required GitHub Secrets

- `DEVELOPER_ID_APPLICATION_CERT_BASE64`: base64-encoded `.p12` Developer ID Application certificate
- `DEVELOPER_ID_APPLICATION_CERT_PASSWORD`: password for the `.p12`
- `APP_STORE_CONNECT_API_KEY_BASE64`: base64-encoded App Store Connect API private key
- `APP_STORE_CONNECT_API_KEY_ID`: App Store Connect API key id
- `APP_STORE_CONNECT_API_ISSUER`: App Store Connect issuer UUID

## Optional GitHub Secrets

- `DEVELOPER_ID_APPLICATION_IDENTITY`: exact codesigning identity if multiple Developer ID identities exist
- `SIGNING_KEYCHAIN_PASSWORD`: temporary CI keychain password

The release workflow fails before publishing if required signing or notarization credentials are missing.

## Manual Release Verification

Run the clean-runner verification workflow against a published tag:

```sh
gh workflow run verify-release-dmg.yml --ref main -f tag=v0.9.4
```

The verification run should report:

```text
BrainBar.app: valid on disk
The validate action worked!
BrainBar.app: accepted
source=Notarized Developer ID
```
