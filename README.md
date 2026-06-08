# BrainBar

> A local-first macOS control center for Obsidian/Markdown + Graphify.

[![Latest release](https://img.shields.io/github/v/release/Nova1390/brain-bar?style=flat-square)](https://github.com/Nova1390/brain-bar/releases/latest)
[![macOS 14+](https://img.shields.io/badge/macOS-14%2B-111827?style=flat-square&logo=apple)](https://www.apple.com/macos/)
[![SwiftUI](https://img.shields.io/badge/SwiftUI-native-F05138?style=flat-square&logo=swift&logoColor=white)](https://developer.apple.com/xcode/swiftui/)
[![Graphify](https://img.shields.io/badge/Graphify-compatible-6D7DFF?style=flat-square)](https://github.com/safishamsi/graphify)
[![License: MIT](https://img.shields.io/badge/license-MIT-0f172a?style=flat-square)](LICENSE)

![BrainBar social preview](docs/brainbar-social-preview.png)

BrainBar is a native macOS menu bar control center for a local-first Markdown or Obsidian vault powered by [Graphify](https://github.com/safishamsi/graphify).

It keeps the graph where it belongs: on your machine, inside a compact menu bar app, with direct access to refresh, inspect, open, and check local workflow state.

## Why

- **See the graph immediately.** Click the menu bar icon and inspect `graphify-out/graph.html` inside BrainBar, without opening a browser tab.
- **Open the note behind a node.** Select or double-click graph nodes to jump back to the local source file.
- **Run local workflow checks.** Trigger Graphify refreshes, custom checks, and queue preflight scripts from one native surface.
- **Keep lightweight queues visible.** Review Queue can show pending local inbox/preflight status without owning the review logic.
- **Stay local-first.** BrainBar runs local commands, opens local files, and never uploads vault contents.
- **Keep the workflow generic.** Vault paths, Graphify commands, dashboards, reports, and check scripts live in local config, not in the public repo.

## What BrainBar Does

| Need | BrainBar gives you |
| --- | --- |
| Graph access | Menu bar graph lens, larger Focus Window, Source Lens filtering, and optional `3D Beta` spatial view. |
| Note navigation | Node inspection, Open Note action, and double-click-to-open local source files. |
| Local control | Graphify refresh, System Status, Brain Check hook, Review Queue status, and optional local server. |

## Highlights

- Native SwiftUI macOS app with `MenuBarExtra` and a regular Focus Window.
- Embedded WebKit graph view for `graphify-out/graph.html`.
- Runtime 2D graph skin that does not rewrite Graphify output.
- Experimental `3D Beta` renderer for spatial exploration of the same local graph metadata.
- Runtime workflow views for `Needs Links`, `Key Notes`, `Review`, `Recent`, `Wikilinks`, `Graphify`, and `Graph Check`.
- Node inspection with Focus note controls, edge provenance, and an Open Note action.
- Graph Check views for local maintenance signals such as notes that need links, key notes, disconnected groups, and stale key notes when timestamps exist.
- Graphify refresh from the footer, toolbar, or action menu.
- System Status panel for vault, graph file, Graphify command, Git, Review Queue, and Brain Check.
- Optional generic Review Queue panel for local inbox/preflight workflows.
- Configurable vault path, dashboard path, report path, server port, and commands.
- Optional Obsidian URL scheme support, local HTTP server, and macOS notifications.

## Product Tour

Screenshots and product previews are public-safe and demonstrate the BrainBar UI without including private vault content.

### Focus Window

BrainBar expands from the menu bar into a larger native Focus Window for longer graph exploration, while keeping refresh, settings, workflow views, and action controls close at hand.

![BrainBar Focus Window](docs/brainbar-focus-all.png)

### Source Lens

Switch between the full graph, generated Graphify relationships, and native wikilinks without modifying the generated Graphify HTML on disk. The lens is session-only: it changes the current view, not your files.

![BrainBar Source Lens](docs/brainbar-readme-source-lens.png)

### Node Navigation

Select a graph node to inspect its metadata, then open the backing local note or source file directly from BrainBar. BrainBar resolves source paths inside the configured vault before opening them.

![BrainBar node navigation](docs/brainbar-readme-node-focus.png)

The 2D graph also includes local workflow views for Focus, Needs Links, Key Notes, Review, Recent, Wikilinks, Graphify, and Graph Check. These views are runtime-only: they filter the current graph scene without changing Graphify output or writing to the vault.

Selecting a connection shows a compact edge inspector with source node, target node, relationship label, provenance, and source path when the generated graph exposes enough metadata.

### 3D Beta

`3D Beta` is an experimental Focus Window renderer for spatial exploration. It uses the same local `graph.json` metadata as the 2D view, supports Source Lens filtering, node inspection, hover/focus labels, Open Note, zoom, fit, top view, and free orbit navigation.

![BrainBar 3D Beta](docs/brainbar-readme-3d-beta.png)

#### Shortest Path

Pick one note, start a path, then click another note. BrainBar traces the shortest visible route through the 3D graph, dims the surrounding noise, and keeps the ordered path inspectable in the sidebar.

![BrainBar 3D shortest path](docs/brainbar-path-demo.gif)

The 2D graph remains the stable default. The 3D renderer is intentionally labeled beta while interaction, density, and performance continue to improve for large graphs.

### System Status And Review Queue

System Status gives a compact read-only check of the local setup: vault, graph file, Graphify command, Git state, Review Queue, and Brain Check.

Review Queue is a generic local dashboard for inbox/preflight workflows. It reads JSON from a configured command, shows pending count and optional items, and can run an optional manual action only when clicked. The background watcher is off by default and only runs the status command.

## Graphify

BrainBar is a companion app for [Graphify](https://github.com/safishamsi/graphify), an open-source tool that turns folders of code, docs, notes, papers, and other inputs into a navigable knowledge graph.

Graphify writes the files BrainBar expects by default:

```text
graphify-out/
├── graph.html
├── graph.json
└── GRAPH_REPORT.md
```

BrainBar does not vendor, fork, or modify Graphify. It runs the configured local `graphify` command and embeds the generated `graph.html` file.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/Nova1390/brain-bar/main/install.sh | bash
```

The installer downloads the latest notarized GitHub Release DMG, installs `BrainBar.app` into `~/Applications`, and creates local config only if it is missing.

To prefill the vault path on first install:

```sh
BRAIN_BAR_VAULT_PATH="/path/to/your/vault" curl -fsSL https://raw.githubusercontent.com/Nova1390/brain-bar/main/install.sh | bash
```

To install elsewhere:

```sh
BRAIN_BAR_INSTALL_DIR=/Applications curl -fsSL https://raw.githubusercontent.com/Nova1390/brain-bar/main/install.sh | bash
```

Public releases from `v0.9.3` onward are Developer ID signed, notarized by Apple, stapled, packaged as `BrainBar.dmg`, and verified on a fresh GitHub-hosted macOS runner before promotion. If you install an older ad-hoc build, macOS may block the app until you approve it manually:

1. Try to open BrainBar once.
2. If macOS blocks it, open System Settings > Privacy & Security.
3. In the Security section, choose Open Anyway for BrainBar.
4. If the app does not appear there, right-click BrainBar in Finder and choose Open.

## Requirements

- macOS 14 or newer
- Xcode 26 or newer for local development
- `git` available on `PATH`
- `graphify` available on `PATH` if you use the default refresh command

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
  "reviewQueue": {
    "backgroundWatcherEnabled": false,
    "isEnabled": false,
    "manualCommand": null,
    "preflightCommand": null,
    "timeoutSeconds": 10,
    "watcherIntervalSeconds": 300
  },
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

Use the 2D workflow toolbar to switch between all graph edges, Graphify-generated relationships, and wikilinks exported in the Graphify metadata. The lens is session-only and does not change local config or rewrite generated files.

Select a node to inspect it. If the generated graph includes a source file for that node, BrainBar shows an Open Note action and supports double-clicking the node to open the backing local file. Source paths are resolved inside the configured vault before opening.

The visual styling is applied at runtime by BrainBar through WebKit. The original `graphify-out/graph.html` file is not rewritten.

## Focus Window

Use the Focus Window toolbar button to open a larger resizable graph window. It shares the same configuration and state as the menu bar popover, but gives the graph more room for inspection.

If BrainBar has not been configured yet, the app guides you through the minimum setup: choose a vault, check whether Graphify output exists, then refresh the graph. Missing paths and missing graph files are shown as recoverable states with direct actions.

The Focus Window also includes an experimental `2D / 3D Beta` view switch. `2D` keeps the standard embedded Graphify view plus BrainBar's runtime workflow controls. `3D Beta` opens a BrainBar-owned Canvas renderer with controlled depth projection, freer orbit navigation, zoom, fit, top view, reset tilt, Source Lens filtering, node inspection, fading active labels, and Open Note support.

The 3D renderer is bundled locally and does not use a CDN. It reads the same local `graph.json` metadata as the 2D Source Lens, and it does not rewrite Graphify output files. See [Experimental 3D Focus Graph](docs/experimental-3d-focus-graph.md) for architecture notes and stability criteria.

Settings can be opened from either the popover or Focus Window. BrainBar brings the Settings window to the front so it does not get hidden behind the graph window.

The action menu includes a System Status panel for quick, non-mutating checks: vault path, graph file, Graphify command availability, Git state, Review Queue, and Brain Check configuration. Graph Check inside the 2D viewer is also read-only and highlights graph maintenance surfaces without modifying files.

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

## Review Queue

Review Queue is a generic local status panel for workflows that have an inbox, queue, or preflight script. BrainBar does not inspect, interpret, or modify vault content by itself. It only displays the JSON status returned by your configured command and runs optional actions when you explicitly click them.

BrainBar is the dashboard, not the worker. Keep private review logic, file writes, network calls, or mutating workflows inside your own script or CLI.

It supports three levels:

| Level | Behavior |
| --- | --- |
| Status Only | Shows pending count, last checked time, optional compact error, and a short item list if the command returns one. |
| Manual Trigger | Adds an optional Run Action button for a command you explicitly click. |
| Background Watcher | Opt-in and off by default. It only runs the status/preflight command at a light interval. It never runs the manual action automatically. |

The status command must print JSON to stdout:

```json
{
  "pending_count": 2,
  "items": [
    { "title": "Draft item", "detail": "Needs manual review" },
    { "title": "Queued file" }
  ]
}
```

`items` is optional. BrainBar treats item fields as generic display text and does not interpret them. If `pending_count` is `0`, BrainBar stays quiet and simply shows the current status.

Items may optionally include `source_file` or `node_id`. When present, BrainBar can highlight matching nodes in the runtime Review graph view. Items without graph targets remain plain queue rows.

For a quick local demo in Settings, use `Use Demo Status`, then `Save & Check`. This fills a status-only command that returns static sample JSON. It does not configure a manual action.

Example config:

```json
"reviewQueue": {
  "isEnabled": true,
  "preflightCommand": {
    "executable": "python3",
    "arguments": ["scripts/review_queue_status.py"],
    "workingDirectory": "vault"
  },
  "manualCommand": {
    "executable": "python3",
    "arguments": ["scripts/run_review.py"],
    "workingDirectory": "vault"
  },
  "backgroundWatcherEnabled": false,
  "watcherIntervalSeconds": 300,
  "timeoutSeconds": 10
}
```

For real workflows, prefer a small script:

```text
Status command executable: python3
Status command arguments: scripts/review_queue_status.py
```

The script should print the JSON status to stdout and exit with code `0`. Because Review Queue commands are local `Process` commands, shell-only syntax such as pipes, redirects, aliases, inline environment variables, and complex quoting is not interpreted. Put that logic in a script and point BrainBar at the script.

The background watcher is intentionally conservative: it is disabled by default, uses a minimum interval of 300 seconds, and only runs the status command. Manual action commands never run automatically.

## Local Server

The embedded graph view does not need the local server. The server is available from Actions > Advanced for workflows that need an HTTP URL instead of a local file URL, for example:

```text
http://127.0.0.1:8765/graphify-out/graph.html
```

BrainBar starts the server with Python's built-in `http.server`, bound to `127.0.0.1`. It is intended for local fallback/debug use, not cloud publishing.

## Development

Project vocabulary is tracked in [CONCEPTS.md](CONCEPTS.md). Project history is tracked in [CHANGELOG.md](CHANGELOG.md).

Build:

```sh
xcodebuild -project BrainBar.xcodeproj -scheme BrainBar -destination 'platform=macOS' build
```

Test:

```sh
xcodebuild test -project BrainBar.xcodeproj -scheme BrainBar -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO
```

Package a local ad-hoc release zip:

```sh
scripts/package-release.sh
```

Package a Developer ID signed and notarized release DMG:

```sh
BRAINBAR_SIGNING_MODE=developer-id \
BRAINBAR_NOTARIZE=1 \
BRAINBAR_DEVELOPER_ID_IDENTITY="Developer ID Application: Your Name (TEAMID)" \
BRAINBAR_NOTARY_API_KEY_PATH=/path/to/AuthKey.p8 \
BRAINBAR_NOTARY_API_KEY_ID=KEYID \
BRAINBAR_NOTARY_API_ISSUER=ISSUER-UUID \
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
   git tag v0.9.3
   git push origin v0.9.3
   ```

4. GitHub Actions signs, notarizes, staples, builds `BrainBar.dmg`, verifies the mounted app, and attaches it to the release.
5. Run `Verify Release DMG` against the tag to download the published asset on a clean macOS runner and re-check `codesign`, `stapler`, and `spctl`.

The expected release asset name is:

```text
BrainBar.dmg
```

The installer downloads this asset from the latest GitHub Release.

To manually verify a published release from GitHub Actions:

```sh
gh workflow run verify-release-dmg.yml --ref main -f tag=v0.9.3
```

The verification run should report:

```text
BrainBar.app: valid on disk
The validate action worked!
BrainBar.app: accepted
source=Notarized Developer ID
```

## Homebrew Roadmap

The preferred v1 distribution is the simple release installer above. A later release can add a Homebrew cask in a tap such as `Nova1390/homebrew-tap`:

```ruby
cask "brain-bar" do
  version "0.9.3"
  sha256 "<release dmg sha256>"
  url "https://github.com/Nova1390/brain-bar/releases/download/v#{version}/BrainBar.dmg"
  name "BrainBar"
  desc "Native macOS menu bar control panel for local-first vault workflows"
  homepage "https://github.com/Nova1390/brain-bar"
  app "BrainBar.app"
end
```

## Signing And Notarization

Public releases are built as Developer ID signed and Apple-notarized `BrainBar.dmg` assets.

The release workflow fails before publishing if signing or notarization credentials are missing, then verifies the mounted DMG before upload. Maintainer setup details live in [RELEASING.md](RELEASING.md).

## Privacy

BrainBar is local-first. It opens local files, runs local commands, and can serve the graph HTML on `127.0.0.1`. It does not send vault contents to any cloud service.
