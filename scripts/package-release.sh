#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT/build/release"
PRODUCTS_DIR="$BUILD_DIR/products"
STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/brainbar-package.XXXXXX")"
trap 'rm -rf "$STAGING_DIR"' EXIT

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
codesign --force --deep --sign - "$STAGED_APP"
codesign --verify --deep --strict "$STAGED_APP"

ditto -c -k --keepParent "$STAGED_APP" "$PRODUCTS_DIR/BrainBar.zip"
printf "Packaged %s\n" "$PRODUCTS_DIR/BrainBar.zip"
