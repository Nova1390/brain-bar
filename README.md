# BrainBar

BrainBar is a small native macOS menu bar app for controlling a local-first Markdown vault and Graphify memory workflow.

It is intentionally generic and public-safe: no vault contents, no private vault path, no cloud integration, and no bundled personal data. The vault path lives only in local configuration.

## Features

- macOS menu bar app built with SwiftUI and `MenuBarExtra`
- Compact graph-first popover with an embedded `graphify-out/graph.html` view
- Larger Focus Window for longer graph exploration
- Native action menu for vault, graph, checks, advanced server controls, settings, and quit
- Visible vault, Git, Graphify, and brain check status
- One-click Graphify refresh from the footer or action menu
- Runtime graph skin inside BrainBar, without modifying the generated Graphify HTML
- Buttons/menu actions to open the vault, dashboard, graph externally, Graphify report, refresh Graphify, and run a configurable check command
- Optional local HTTP server for `graphify-out/graph.html` as a fallback/debug tool
- Optional Obsidian URL scheme support
- Optional macOS notifications after long-running commands finish

BrainBar loads the generated graph file directly in an embedded WebKit view. It does not require a browser for the normal graph workflow.

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

v1 releases may be unsigned. On first launch, macOS may block the app until you approve it manually:

1. Try to open BrainBar once.
2. If macOS blocks it, open System Settings > Privacy & Security.
3. In the Security section, choose Open Anyway for BrainBar.
4. If the app does not appear there, right-click BrainBar in Finder and choose Open.

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
      "arguments": ["update", "."],
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

## Graph View

BrainBar expects a generated Graphify HTML file at:

```text
graphify-out/graph.html
```

If the file exists, BrainBar embeds it directly in the menu bar popover and Focus Window. If no refresh has run in the current app session, BrainBar uses the file modification date and shows a status such as `Graph updated 2 min. ago`.

The footer Graphify status is also a refresh button. Click it to run the configured `refreshGraph` command. During refresh, BrainBar shows `Refreshing Graph...`; if the command succeeds, the embedded graph reloads.

The visual styling is applied at runtime by BrainBar through WebKit. The original `graphify-out/graph.html` file is not rewritten.

## Focus Window

Use Actions > Graph > Open Focus Window to open a larger resizable graph window. It shares the same configuration and state as the menu bar popover, but gives the graph more room for inspection.

Settings can be opened from either the popover or Focus Window. BrainBar brings the Settings window to the front so it does not get hidden behind the graph window.

## Brain Check Commands

BrainBar does not include a built-in definition of "brain check". Instead, it exposes a local command hook that you can point at any script or CLI that validates your own vault.

The default public config leaves it disabled:

```json
"brainCheck": null
```

When it is disabled, the app shows `Brain Check Not Configured`. That is not an error; it means BrainBar is waiting for you to define what a check means for your setup.

Brain check commands always run with the vault as their working directory. This keeps the repo generic and lets each user wire their own private workflow without hardcoding paths or vault-specific scripts into BrainBar.

Examples:

| Use case | Brain check executable | Brain check arguments |
| --- | --- | --- |
| Run a Python script inside the vault | `python3` | `scripts/brain_check.py` |
| Run a shell script inside the vault | `bash` | `scripts/brain_check.sh` |
| Run an executable script in the vault | `./scripts/brain_check` | |
| Run a custom installed CLI | `brain-check` | `--strict .` |

If your terminal command is:

```sh
python3 scripts/brain_check.py --strict
```

configure BrainBar like this:

```text
Brain check executable: python3
Brain check arguments: scripts/brain_check.py --strict
```

Because BrainBar uses `Process` directly rather than a shell, shell-only syntax such as pipes, redirects, aliases, and inline environment variables is not interpreted. Put that logic in a script, then configure BrainBar to run the script.

## Local Server

The embedded graph view does not need the local server. The server is available from Actions > Advanced for workflows that need an HTTP URL instead of a local file URL, for example:

```text
http://127.0.0.1:8765/graphify-out/graph.html
```

BrainBar starts the server with Python's built-in `http.server`, bound to `127.0.0.1`. It is intended for local fallback/debug use, not cloud publishing.

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

The expected release asset name is:

```text
BrainBar.zip
```

The installer downloads this asset from the latest GitHub Release.

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
