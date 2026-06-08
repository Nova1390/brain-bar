#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT/build/release"
PRODUCTS_DIR="$BUILD_DIR/products"
STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/brainbar-package.XXXXXX")"
trap 'rm -rf "$STAGING_DIR"' EXIT

SIGNING_MODE="${BRAINBAR_SIGNING_MODE:-adhoc}"
NOTARIZE="${BRAINBAR_NOTARIZE:-0}"
DEVELOPER_ID_IDENTITY="${BRAINBAR_DEVELOPER_ID_IDENTITY:-Developer ID Application}"
NOTARY_TIMEOUT="${BRAINBAR_NOTARY_TIMEOUT:-90m}"

fail() {
  printf "%s\n" "$1" >&2
  exit 1
}

build_notary_args() {
  NOTARY_ARGS=()

  if [ -n "${BRAINBAR_NOTARY_KEYCHAIN_PROFILE:-}" ]; then
    NOTARY_ARGS=(--keychain-profile "$BRAINBAR_NOTARY_KEYCHAIN_PROFILE")
    return
  fi

  if [ -n "${BRAINBAR_NOTARY_API_KEY_PATH:-}" ] && [ -n "${BRAINBAR_NOTARY_API_KEY_ID:-}" ]; then
    NOTARY_ARGS=(--key "$BRAINBAR_NOTARY_API_KEY_PATH" --key-id "$BRAINBAR_NOTARY_API_KEY_ID")
    if [ -n "${BRAINBAR_NOTARY_API_ISSUER:-}" ]; then
      NOTARY_ARGS+=(--issuer "$BRAINBAR_NOTARY_API_ISSUER")
    fi
    return
  fi

  if [ -n "${BRAINBAR_APPLE_ID:-}" ] && [ -n "${BRAINBAR_APPLE_TEAM_ID:-}" ] && [ -n "${BRAINBAR_APP_SPECIFIC_PASSWORD:-}" ]; then
    NOTARY_ARGS=(--apple-id "$BRAINBAR_APPLE_ID" --team-id "$BRAINBAR_APPLE_TEAM_ID" --password "$BRAINBAR_APP_SPECIFIC_PASSWORD")
    return
  fi

  fail "Notarization requested, but no notary credentials were provided."
}

rm -rf "$BUILD_DIR"
mkdir -p "$PRODUCTS_DIR"

"$ROOT/scripts/check-public-safety.sh"

xcodebuild \
  -project "$ROOT/BrainBar.xcodeproj" \
  -scheme BrainBar \
  -configuration Release \
  -derivedDataPath "$BUILD_DIR/DerivedData" \
  CODE_SIGNING_ALLOWED=NO \
  build

APP_PATH="$BUILD_DIR/DerivedData/Build/Products/Release/BrainBar.app"
if [ ! -d "$APP_PATH" ]; then
  printf "Build did not produce %s\n" "$APP_PATH" >&2
  exit 1
fi

STAGED_APP="$STAGING_DIR/BrainBar.app"
ditto --noextattr --noqtn "$APP_PATH" "$STAGED_APP"
xattr -cr "$STAGED_APP"

case "$SIGNING_MODE" in
  adhoc)
    if [ "$NOTARIZE" = "1" ]; then
      fail "Ad-hoc signing cannot be notarized. Set BRAINBAR_SIGNING_MODE=developer-id."
    fi
    codesign --force --deep --sign - "$STAGED_APP"
    ;;
  developer-id)
    codesign --force --deep --options runtime --timestamp --sign "$DEVELOPER_ID_IDENTITY" "$STAGED_APP"
    ;;
  *)
    fail "Unknown BRAINBAR_SIGNING_MODE: $SIGNING_MODE"
    ;;
esac

codesign --verify --deep --strict --verbose=2 "$STAGED_APP"

if [ "$NOTARIZE" = "1" ]; then
  if [ "$SIGNING_MODE" != "developer-id" ]; then
    fail "Notarization requires BRAINBAR_SIGNING_MODE=developer-id."
  fi

  build_notary_args
  NOTARY_ZIP="$STAGING_DIR/BrainBar-notary.zip"
  ditto -c -k --keepParent "$STAGED_APP" "$NOTARY_ZIP"
  xcrun notarytool submit "$NOTARY_ZIP" --wait --timeout "$NOTARY_TIMEOUT" "${NOTARY_ARGS[@]}"
  xcrun stapler staple "$STAGED_APP"
  xcrun stapler validate "$STAGED_APP"
  spctl --assess --type execute --verbose=4 "$STAGED_APP"
fi

if [ "$NOTARIZE" = "1" ]; then
  DMG_ROOT="$STAGING_DIR/dmg-root"
  DMG_MOUNT="$STAGING_DIR/dmg-mount"
  DMG_PATH="$PRODUCTS_DIR/BrainBar.dmg"
  mkdir -p "$DMG_ROOT" "$DMG_MOUNT"
  ditto "$STAGED_APP" "$DMG_ROOT/BrainBar.app"
  hdiutil create -volname BrainBar -srcfolder "$DMG_ROOT" -ov -format UDZO "$DMG_PATH"
  hdiutil attach "$DMG_PATH" -mountpoint "$DMG_MOUNT" -nobrowse -quiet
  codesign --verify --deep --strict --verbose=2 "$DMG_MOUNT/BrainBar.app"
  xcrun stapler validate "$DMG_MOUNT/BrainBar.app"
  spctl --assess --type execute --verbose=4 "$DMG_MOUNT/BrainBar.app"
  hdiutil detach "$DMG_MOUNT" -quiet
  printf "Packaged %s\n" "$DMG_PATH"
else
  ZIP_PATH="$PRODUCTS_DIR/BrainBar.zip"
  ZIP_VERIFY_DIR="$STAGING_DIR/zip-verify"
  ditto -c -k --keepParent "$STAGED_APP" "$ZIP_PATH"
  mkdir -p "$ZIP_VERIFY_DIR"
  ditto -x -k "$ZIP_PATH" "$ZIP_VERIFY_DIR"
  codesign --verify --deep --strict --verbose=2 "$ZIP_VERIFY_DIR/BrainBar.app"
  printf "Packaged %s\n" "$ZIP_PATH"
fi
