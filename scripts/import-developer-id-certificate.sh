#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf "%s\n" "$1" >&2
  exit 1
}

[ -n "${DEVELOPER_ID_APPLICATION_CERT_BASE64:-}" ] || fail "Missing DEVELOPER_ID_APPLICATION_CERT_BASE64."
[ -n "${DEVELOPER_ID_APPLICATION_CERT_PASSWORD:-}" ] || fail "Missing DEVELOPER_ID_APPLICATION_CERT_PASSWORD."

KEYCHAIN_PASSWORD="${SIGNING_KEYCHAIN_PASSWORD:-brainbar-ci-signing}"
KEYCHAIN_PATH="${RUNNER_TEMP:-/tmp}/brainbar-signing.keychain-db"
CERT_PATH="${RUNNER_TEMP:-/tmp}/brainbar-developer-id.p12"

printf "%s" "$DEVELOPER_ID_APPLICATION_CERT_BASE64" | base64 --decode > "$CERT_PATH"

security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security import "$CERT_PATH" -P "$DEVELOPER_ID_APPLICATION_CERT_PASSWORD" -A -t cert -f pkcs12 -k "$KEYCHAIN_PATH"
security list-keychains -d user -s "$KEYCHAIN_PATH" $(security list-keychains -d user | tr -d '"')
security default-keychain -d user -s "$KEYCHAIN_PATH"
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security find-identity -v -p codesigning "$KEYCHAIN_PATH"
