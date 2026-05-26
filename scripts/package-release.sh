#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT/build/release"
ARCHIVE_DIR="$BUILD_DIR/archive"
PRODUCTS_DIR="$BUILD_DIR/products"

rm -rf "$BUILD_DIR"
mkdir -p "$ARCHIVE_DIR" "$PRODUCTS_DIR"

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

xattr -cr "$APP_PATH"
codesign --force --deep --sign - "$APP_PATH"
codesign --verify --deep --strict "$APP_PATH"

ditto -c -k --keepParent "$APP_PATH" "$PRODUCTS_DIR/BrainBar.zip"
printf "Packaged %s\n" "$PRODUCTS_DIR/BrainBar.zip"
