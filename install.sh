#!/usr/bin/env bash
set -euo pipefail

REPO="Nova1390/brain-bar"
APP_NAME="BrainBar"
ASSET_NAME="BrainBar.zip"
INSTALL_DIR="${BRAIN_BAR_INSTALL_DIR:-$HOME/Applications}"
APP_PATH="$INSTALL_DIR/$APP_NAME.app"
CONFIG_DIR="$HOME/Library/Application Support/BrainBar"
CONFIG_PATH="$CONFIG_DIR/config.json"
DOWNLOAD_URL="https://github.com/$REPO/releases/latest/download/$ASSET_NAME"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

confirm() {
  local prompt="$1"
  if [ "${BRAIN_BAR_FORCE:-0}" = "1" ]; then
    return 0
  fi
  if [ -r /dev/tty ]; then
    printf "%s [y/N] " "$prompt" > /dev/tty
    read -r answer < /dev/tty
    case "$answer" in
      y|Y|yes|YES) return 0 ;;
      *) return 1 ;;
    esac
  fi
  return 1
}

create_config_if_missing() {
  mkdir -p "$CONFIG_DIR"
  if [ -f "$CONFIG_PATH" ]; then
    printf "Keeping existing config: %s\n" "$CONFIG_PATH"
    return
  fi

  local vault_path="${BRAIN_BAR_VAULT_PATH:-}"
  cat > "$CONFIG_PATH" <<JSON
{
  "commands" : {
    "brainCheck" : null,
    "refreshGraph" : {
      "arguments" : [
        "--update",
        "."
      ],
      "executable" : "graphify",
      "workingDirectory" : "vault"
    }
  },
  "graphHtmlRelativePath" : "graphify-out/graph.html",
  "graphReportRelativePath" : "graphify-out/GRAPH_REPORT.md",
  "notificationsEnabled" : false,
  "projectDashboardRelativePath" : "Project Dashboard.md",
  "serverPort" : 8765,
  "useObsidianURLScheme" : false,
  "vaultPath" : "$vault_path"
}
JSON
  printf "Created config: %s\n" "$CONFIG_PATH"
}

if [ -e "$APP_PATH" ] && ! confirm "$APP_PATH already exists. Replace it?"; then
  printf "Install cancelled. Set BRAIN_BAR_FORCE=1 to replace non-interactively.\n"
  exit 1
fi

mkdir -p "$INSTALL_DIR"
printf "Downloading %s\n" "$DOWNLOAD_URL"
curl -fsSL "$DOWNLOAD_URL" -o "$TMP_DIR/$ASSET_NAME"
ditto -x -k "$TMP_DIR/$ASSET_NAME" "$TMP_DIR"

if [ ! -d "$TMP_DIR/$APP_NAME.app" ]; then
  printf "Release asset did not contain %s.app\n" "$APP_NAME" >&2
  exit 1
fi

rm -rf "$APP_PATH"
ditto "$TMP_DIR/$APP_NAME.app" "$APP_PATH"
create_config_if_missing

printf "\nInstalled %s to %s\n" "$APP_NAME" "$APP_PATH"
printf "Open it with:\n  open %q\n" "$APP_PATH"
printf "\nIf macOS blocks the unsigned v1 build, open System Settings > Privacy & Security and approve it manually.\n"
