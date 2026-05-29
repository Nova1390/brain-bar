# Changelog

All notable changes to BrainBar are documented here.

## Unreleased

- Added an experimental custom 3D graph mode for the Focus Window.
- Added a session-only 2D/3D view switch that leaves the menu bar popover on the standard 2D graph.
- Added local bundled Three.js renderer assets for offline 3D graph rendering.
- Added 3D Source Lens support for All, Graphify, and Obsidian graph layers.
- Added 3D node inspection and Open Note routing through the existing vault-safe source opener.
- Added documentation for the experimental 3D Focus Graph architecture and promotion criteria.

## 0.2.0 - 2026-05-27

- Added a dedicated 1280x640 GitHub social preview image.
- Refined the social preview banner with more native app chrome and quieter feature badges.
- Moved the real app screenshot lower in the README as product evidence instead of using it as the top banner.
- Ad-hoc sign release packages and verify the bundle before creating `BrainBar.zip`.
- Added release, GitHub repository, copyright, and MIT license links to Settings.
- Clarified the header Git badge so it explicitly refers to the configured vault.
- Added a session-only Graph Source Lens to switch between All, Graphify, and Obsidian graph relationships.
- Fixed Graph Source Lens metadata loading by passing `graph.json` from Swift into WebKit.
- Stage the release app before signing so package verification is not affected by macOS extended attributes.

## 0.1.2 - 2026-05-26

- Added a real macOS app icon asset catalog so Finder no longer shows the default placeholder icon.
- Replaced the generated README preview SVG with a real public-safe BrainBar screenshot.

## 0.1.1 - 2026-05-26

- Added graph-first menu bar UI with embedded Graphify HTML view.
- Added Focus Window for larger graph exploration.
- Added runtime graph skin for generated Graphify output without modifying `graph.html`.
- Added Settings save confirmation and clearer Brain Check configuration copy.
- Added Graphify status based on generated graph modification time.
- Added footer refresh action for Graphify.
- Improved Settings window ordering when opened from the Focus Window.
- Updated README, installer guidance, and release documentation.

## 0.1.0 - 2026-05-26

- Initial native macOS menu bar app scaffold.
- Added local configuration at `~/Library/Application Support/BrainBar/config.json`.
- Added configurable vault path, Graphify refresh command, and brain check command.
- Added vault status, Git status, local graph server controls, installer, uninstaller, and GitHub Release packaging.
