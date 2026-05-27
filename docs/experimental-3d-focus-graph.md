# Experimental 3D Focus Graph

BrainBar v0.4 explores a custom 3D graph mode for the Focus Window. The goal is to make long graph exploration feel spatial and product-grade without replacing the fast 2D menu bar workflow.

## Why Focus Window Only

The menu bar popover is for quick inspection and control. It should open fast, keep actions close, and stay readable on small surfaces.

The 3D graph needs room for orbit controls, camera movement, node inspection, and depth cues. Keeping it inside the Focus Window avoids turning the popover into a heavy workspace and keeps the default BrainBar flow stable.

## What Experimental Means

The 3D mode is a preview surface, not the primary graph view. It should be easy to try, easy to leave, and safe to remove or reshape before a stable release.

Experimental mode must:

- avoid changing the public config schema;
- avoid rewriting Graphify output files;
- keep all graph data local;
- preserve the existing 2D graph behavior;
- fail softly when graph data is unavailable or a lens has no visible edges.

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
- edges use lightweight WebGL line geometry;
- nodes are rendered as compact colored points;
- camera controls support orbit, zoom, and reset;
- styling follows BrainBar's dark native-premium visual direction.

The renderer should prioritize clarity over spectacle. It is not meant to look like a generic 3D demo.

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

## Promotion Criteria

The 3D mode can become a stable headline feature only if it passes these checks:

- 2D popover and Focus Window behavior remain unchanged by default;
- 3D mode is usable on a graph of roughly 1,000 nodes and 2,000 edges on a modern Mac;
- Source Lens switching does not reload the whole app;
- node selection and Open Note work consistently;
- camera controls feel predictable;
- validation passes with public safety, unit tests, and macOS build.

If the 3D mode feels noisy, slow, or less useful than the 2D graph, it should stay experimental or be removed before release.
