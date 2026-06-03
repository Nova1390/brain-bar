# Contributing to BrainBar

Thanks for helping improve BrainBar.

BrainBar is a local-first macOS menu bar app for Markdown/Obsidian vaults and Graphify output. Contributions should keep the project generic, public-safe, and lightweight.

## Project Principles

- Keep BrainBar local-first. Do not add cloud services or telemetry.
- Keep the repo public-safe. Do not commit private vault content, local paths, tokens, config files, or personal workflow details.
- Keep integrations generic. Commands should be configurable local scripts or CLIs, not hardcoded private workflows.
- Keep changes small. Prefer focused pull requests over broad refactors.
- Do not modify user vault content from inside BrainBar unless a future feature explicitly documents that behavior.

## Development Setup

Requirements:

- macOS 14 or newer
- Xcode 26 or newer
- `git`
- `graphify` if you want to test the default refresh command

Build:

```sh
xcodebuild -project BrainBar.xcodeproj -scheme BrainBar -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO build
```

Run tests:

```sh
xcodebuild test -project BrainBar.xcodeproj -scheme BrainBar -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO
```

Run public-safety checks:

```sh
scripts/check-public-safety.sh
```

Run JavaScript runtime checks:

```sh
node --check BrainBar/Resources/Graph2D/brainbar-graph-runtime.js
node --check BrainBar/Resources/Graph3D/graph3d.js
node scripts/test-graph-runtime.mjs
```

## Local Configuration

BrainBar stores user config in:

```text
~/Library/Application Support/BrainBar/config.json
```

Do not commit this file or any local vault path. Use temporary fixtures or generic examples in tests and docs.

## Pull Requests

Before opening a PR:

- Keep the diff focused on one problem.
- Add or update tests when behavior changes.
- Run the checks above when possible.
- Update README or docs if user-facing behavior changes.
- Avoid screenshots that reveal private file names, vault paths, or note content.

## Reporting Bugs

Please include:

- macOS version
- BrainBar version or commit
- whether the issue is in the menu bar popover, Focus Window, Settings, installer, or command execution
- relevant error text
- sanitized config snippets if needed

Do not include private vault content or secrets.
