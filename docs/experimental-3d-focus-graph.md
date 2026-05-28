# Experimental 3D Focus Graph

BrainBar v0.4 explores a custom `3D Beta` graph mode for the Focus Window. The stable product path remains the embedded 2D Graphify graph; the 3D view is a separate experiment for controlled spatial exploration and visual research.

Current status: the 3D renderer is quarantined from the visible Focus Window UI until it can load and stay visible reliably on real vault graphs. The branch keeps the renderer code and technical notes for follow-up work, but the installed app should use the stable 2D graph path by default.

## Why Focus Window Only

The menu bar popover is for quick inspection and control. It should open fast, keep actions close, and stay readable on small surfaces.

The 3D graph needs room for camera controls, node inspection, and depth cues. Keeping it inside the Focus Window avoids turning the popover into a heavy workspace and keeps the default BrainBar flow stable.

## What Experimental Means

The 3D mode is a preview surface, not the primary graph view. It should be easy to try, easy to leave, and safe to remove or reshape before a stable release. If the 3D graph is less readable than the 2D graph on a real vault, BrainBar should keep the 2D graph as the default experience.

At this stage the 3D toggle should remain hidden from the production Focus Window. Re-enabling it requires a focused renderer fix and visual QA pass.

Experimental mode must:

- avoid changing the public config schema;
- avoid rewriting Graphify output files;
- keep all graph data local;
- preserve the existing 2D graph behavior;
- fail softly when graph data is unavailable or a lens has no visible edges;
- stay recoverable through visible fit, top view, zoom, and reset-tilt controls.

## Architecture

`Graph3DWebView` is a dedicated WebKit view for the Focus Window. It loads a local BrainBar-owned renderer instead of loading `graphify-out/graph.html` directly.

The renderer uses local bundled assets:

- `Graph3D/index.html`
- `Graph3D/graph3d.css`
- `Graph3D/graph3d.js`
- vendored Three.js runtime files

No CDN or runtime network access is required.

## Data Flow

BrainBar reads the configured vault's Graphify output directory and injects normalized graph metadata into the 3D WebKit page.

Expected default files:

```text
graphify-out/
├── graph.html
├── graph.json
└── GRAPH_REPORT.md
```

The 3D renderer reads nodes and edges from the injected `graph.json` payload. It treats `links` and `edges` as equivalent edge collections where possible, matching the 2D Source Lens behavior.

## Layout And Rendering

The 3D view is custom BrainBar behavior on top of Three.js:

- communities become spatial clusters;
- node positions are deterministic for stable reloads;
- depth is controlled and deterministic rather than random;
- edges use lightweight WebGL line geometry;
- nodes are rendered as compact colored points;
- the default camera is a readable top-down view;
- camera tilt is constrained so the graph cannot become an edge-on stripe field;
- camera controls support zoom, fit, top view, and reset tilt;
- a small HUD reports node count, edge count, current lens, camera preset, and renderer diagnostics;
- styling follows BrainBar's dark native-premium visual direction.

The renderer should prioritize clarity over spectacle. It is not meant to look like a generic 3D demo, and it should not be promoted to the main demo path until real-vault screenshots look at least as useful as the 2D view.

## Source Lens

The 3D view supports the same session-only Source Lens as the 2D graph:

- `All`: all nodes and edges;
- `Graphify`: generated Graphify relationships, excluding native Obsidian wikilinks;
- `Obsidian`: native Obsidian wikilinks only.

If a lens has no visible edges, the 3D view shows a compact empty overlay instead of presenting it as an error.

## Node Navigation

The 3D view keeps the same navigation contract as the 2D graph:

- click a node to inspect it;
- double-click a node to open its source file;
- show an Open Note action when the node includes a source file;
- resolve paths through BrainBar's existing vault-safe source opening logic.

The renderer sends only node action metadata back to Swift. Swift remains responsible for validating and opening files.

## Viewport Controls

When the 3D experiment is enabled, the Focus Window should expose graph navigation controls in the native header:

- zoom out;
- zoom in;
- fit graph;
- top view for the 3D renderer;
- reset tilt for the 3D renderer.

The stable 2D view should not depend on the 3D viewport command model. The 2D graph should stay as close as possible to the proven embedded Graphify viewer while the 3D view remains experimental.

The 3D camera is intentionally controlled rather than a free orbit. Left-drag pans, scroll/pinch zooms, and right-drag allows only a limited tilt. This is a product constraint, not a renderer limitation: readable graph inspection matters more than unrestricted 3D movement.

## Promotion Criteria

The 3D mode can become a stable headline feature only if it passes these checks:

- 2D popover and Focus Window behavior remain unchanged by default;
- 3D mode is usable and readable on a graph of roughly 1,000 nodes and 2,000 edges on a modern Mac;
- Source Lens switching does not reload the whole app;
- node selection and Open Note work consistently;
- camera controls feel predictable and recover easily from bad viewing angles;
- validation passes with public safety, unit tests, and macOS build.

If the 3D mode feels noisy, slow, or less useful than the 2D graph, it should stay experimental or be removed before release.
