# BrainBar

BrainBar is a small native macOS menu bar app for controlling a local-first Markdown vault and Graphify memory workflow.

It is intentionally generic and public-safe: no vault contents, no private vault path, no cloud integration, and no bundled personal data. The vault path lives only in local configuration.

## Features

- macOS menu bar app built with SwiftUI and `MenuBarExtra`
- Compact popover with vault, Git, Graphify, brain check, and server status
- Buttons to open the vault, dashboard, graph, Graphify report, refresh Graphify, and run a configurable check command
- Optional local HTTP server for `graphify-out/graph.html`
- Optional Obsidian URL scheme support
- Optional macOS notifications after long-running commands finish

## Requirements

- macOS 14 or newer
- Xcode 26 or newer for local development
- `git` available on `PATH`
- `graphify` available on `PATH` if you use the default refresh command

## Install

The v1 installer downloads the latest GitHub Release asset and installs the app into `~/Applications` by default:

```sh
curl -fsSL https://raw.githubusercontent.com/Nova1390/brain-bar/main/install.sh | bash
```

To install elsewhere:

```sh
BRAIN_BAR_INSTALL_DIR=/Applications curl -fsSL https://raw.githubusercontent.com/Nova1390/brain-bar/main/install.sh | bash
```

The installer creates `~/Library/Application Support/BrainBar/config.json` if it does not exist. It never overwrites an existing config. To prefill the vault path on first install:

```sh
BRAIN_BAR_VAULT_PATH="/path/to/your/vault" curl -fsSL https://raw.githubusercontent.com/Nova1390/brain-bar/main/install.sh | bash
```

v1 releases may be unsigned. If macOS blocks the app, approve it in System Settings > Privacy & Security.

## Update

Run the installer again. If an app already exists, the script asks before replacing it. For non-interactive replacement:

```sh
BRAIN_BAR_FORCE=1 curl -fsSL https://raw.githubusercontent.com/Nova1390/brain-bar/main/install.sh | bash
```

Your local config is preserved.

## Uninstall

```sh
curl -fsSL https://raw.githubusercontent.com/Nova1390/brain-bar/main/uninstall.sh | bash
```

By default, uninstall keeps local configuration. To remove it too:

```sh
BRAIN_BAR_REMOVE_CONFIG=1 curl -fsSL https://raw.githubusercontent.com/Nova1390/brain-bar/main/uninstall.sh | bash
```

## Configuration

Default config path:

```text
~/Library/Application Support/BrainBar/config.json
```

Development and tests can override the config path:

```sh
BRAIN_BAR_CONFIG=/tmp/brainbar-config.json open ~/Applications/BrainBar.app
```

Default schema:

```json
{
  "commands": {
    "brainCheck": null,
    "refreshGraph": {
      "arguments": ["--update", "."],
      "executable": "graphify",
      "workingDirectory": "vault"
    }
  },
  "graphHtmlRelativePath": "graphify-out/graph.html",
  "graphReportRelativePath": "graphify-out/GRAPH_REPORT.md",
  "notificationsEnabled": false,
  "projectDashboardRelativePath": "Project Dashboard.md",
  "serverPort": 8765,
  "useObsidianURLScheme": false,
  "vaultPath": ""
}
```

`workingDirectory: "vault"` means the command runs inside the configured vault directory. Commands are executed with `Process`, not through a shell.

## Development

Build:

```sh
xcodebuild -project BrainBar.xcodeproj -scheme BrainBar -destination 'platform=macOS' build
```

Test:

```sh
xcodebuild test -project BrainBar.xcodeproj -scheme BrainBar -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO
```

Package a release zip:

```sh
scripts/package-release.sh
```

Run the public-safety check:

```sh
scripts/check-public-safety.sh
```

## Release

1. Update `MARKETING_VERSION` in the Xcode project.
2. Run tests and `scripts/check-public-safety.sh`.
3. Tag the release:

   ```sh
   git tag v0.1.0
   git push origin v0.1.0
   ```

4. GitHub Actions builds `BrainBar.zip` and attaches it to the release.

## Homebrew Roadmap

The preferred v1 distribution is the simple release installer above. A later release can add a Homebrew cask in a tap such as `Nova1390/homebrew-tap`:

```ruby
cask "brain-bar" do
  version "0.1.0"
  sha256 "<release zip sha256>"
  url "https://github.com/Nova1390/brain-bar/releases/download/v#{version}/BrainBar.zip"
  name "BrainBar"
  desc "Native macOS menu bar control panel for local-first vault workflows"
  homepage "https://github.com/Nova1390/brain-bar"
  app "BrainBar.app"
end
```

## Signing And Notarization

v1 can ship unsigned with manual approval. A production-ready release should add:

- Developer ID Application signing
- `xcrun notarytool` submission in GitHub Actions
- `xcrun stapler staple` before packaging
- GitHub secrets for Apple signing credentials

## Privacy

BrainBar is local-first. It opens local files, runs local commands, and can serve the graph HTML on `127.0.0.1`. It does not send vault contents to any cloud service.
