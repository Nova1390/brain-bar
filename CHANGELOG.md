# Changelog

All notable changes to BrainBar are documented here.

## Unreleased

- Added 3D Community Spotlight for highlighting a selected visible community with top notes, bridge notes, and a focused camera move.
- Added 3D Path Compare for switching a traced route between Shortest visible, Different route, Best explained, Wikilinks-only, and Graphify-only variants.
- Clarified the 3D no-path state so disconnected nodes explain why compare variants are unavailable instead of showing only disabled options.
- Added deterministic 3D Explain Path summaries under Shortest Path, including provenance badges, bridge notes, community crossing notes, and conservative metadata caveats.

## 0.9.3 - 2026-06-08

- Added Developer ID signing and Apple notarization for public release builds.
- Switched the public release asset from `BrainBar.zip` to notarized `BrainBar.dmg`.
- Added mounted-DMG verification in the release workflow using `codesign`, `stapler`, and `spctl`.
- Added a manual `Verify Release DMG` workflow that downloads the published release asset on a clean macOS runner and validates it independently.
- Updated the installer to download and install from the latest release DMG.

## 0.9.0 - 2026-06-08

- Added runtime 2D graph workflow views for Focus, Needs Links, Key Notes, Review, Recent, Wikilinks, Graphify, and Graph Check.
- Added clearer 2D workflow toolbar states with counts, hidden empty Review targets, disabled empty Recent view, and action panels.
- Added runtime-only file modification metadata from Swift so Recent can use real source-file mtimes when available.
- Added edge provenance inspection for selected graph connections, including source/target labels, relationship, source type, and source path when available.
- Added 3D Focus Orbit controls for focusing a selected node, expanding visible neighbors to depth 1-3, and returning to the full graph.
- Added 3D shortest path tracing with runtime-only path state, BFS over the visible graph, highlighted path nodes/edges, and a compact ordered path inspector.
- Added pure JS smoke coverage for focus filtering, edge provenance, and graph health calculations.
- Added optional Review Queue graph targets via `source_file` and `node_id` fields.
- Neutralized the failed Community Atlas direction as a default graph layout and restored a more stable 2D/3D runtime posture.
- Improved 3D Beta side-view readability by expanding graph depth proportionally to the visible layout.
- Refined README product positioning, feature tour, and Review Queue/3D Beta descriptions.
- Added updated public-safe README visuals for Source Lens, node navigation, and 3D Beta.

## 0.8.0 - 2026-06-03

- Added first-run product guidance for choosing a vault, checking Graphify output, and refreshing the graph.
- Added a System Status menu for quick local checks across Vault, Graph file, Graphify command, Git, Review Queue, and Brain Check.
- Refined the premium graph presentation with stronger native chrome, hollow 2D nodes, calmer visible edges, and a satin Dark Atlas sidebar.
- Renamed the public Source Lens label from Obsidian to Wikilinks while keeping the internal `obsidian` raw value compatible.
- Clarified the README positioning around BrainBar as a local-first macOS control center for seeing graphs, opening notes, and running local workflows.
- Tightened 2D/3D graph copy and sidebar proportions so the graph remains the primary surface.
- Added a generic local Review Queue dashboard for status-only checks, explicit manual actions, and an opt-in conservative background watcher that never runs mutating actions automatically.
- Extracted the 2D graph runtime into bundled JS/CSS resources for easier testing and profiling.
- Added JS smoke tests for Source Lens filtering, diff-only updates, Open Note payloads, and graph resource availability.
- Reduced repeated 2D graph work by avoiding automatic fit on lens switch and skipping unchanged hidden-state updates.
- Added an experimental custom 3D graph mode for the Focus Window.
- Added a session-only 2D/3D view switch that leaves the menu bar popover on the standard 2D graph.
- Added local bundled Three.js renderer assets for offline 3D graph rendering.
- Added 3D Source Lens support for All, Graphify, and Wikilinks graph layers.
- Added 3D node inspection and Open Note routing through the existing vault-safe source opener.
- Added documentation for the experimental 3D Focus Graph architecture and promotion criteria.

## 0.2.0 - 2026-05-27

- Added a dedicated 1280x640 GitHub social preview image.
- Refined the social preview banner with more native app chrome and quieter feature badges.
- Moved the real app screenshot lower in the README as product evidence instead of using it as the top banner.
- Ad-hoc sign release packages and verify the bundle before creating `BrainBar.zip`.
- Added release, GitHub repository, copyright, and MIT license links to Settings.
- Clarified the header Git badge so it explicitly refers to the configured vault.
- Added a session-only Graph Source Lens to switch between All, Graphify, and Wikilinks graph relationships.
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
