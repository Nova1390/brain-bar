#!/usr/bin/env bash
set -euo pipefail

APP_NAME="BrainBar"
INSTALL_DIR="${BRAIN_BAR_INSTALL_DIR:-$HOME/Applications}"
APP_PATH="$INSTALL_DIR/$APP_NAME.app"
CONFIG_DIR="$HOME/Library/Application Support/BrainBar"

if [ -d "$APP_PATH" ]; then
  rm -rf "$APP_PATH"
  printf "Removed %s\n" "$APP_PATH"
else
  printf "App not found at %s\n" "$APP_PATH"
fi

if [ "${BRAIN_BAR_REMOVE_CONFIG:-0}" = "1" ]; then
  rm -rf "$CONFIG_DIR"
  printf "Removed config directory %s\n" "$CONFIG_DIR"
else
  printf "Kept config directory %s\n" "$CONFIG_DIR"
  printf "Set BRAIN_BAR_REMOVE_CONFIG=1 to remove it too.\n"
fi
