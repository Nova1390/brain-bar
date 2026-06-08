# BrainBar Concepts

## Purpose

This file defines BrainBar's project vocabulary so humans and coding agents use the same names for the same ideas.

It is intentionally lightweight, public-safe, and operational. It should prevent parallel names from appearing in code, docs, issues, or agent-generated plans.

BrainBar is a local-first macOS control center for a Markdown or Obsidian-style vault with Graphify-generated graph output. It does not own the user's vault, rewrite generated Graphify files, or define private workflow semantics.

## Product Concepts

- **BrainBar**: the native macOS menu bar app in this repository.
- **Vault**: a user-configured local folder containing Markdown, Obsidian, or other Graphify-compatible source content. Use generic examples such as `local vault`; do not hardcode private paths.
- **Graphify**: the external graph generator BrainBar expects users to install separately. BrainBar runs a configured Graphify command and embeds Graphify output; it does not vendor, fork, or modify Graphify.
- **Graphify output**: the generated files BrainBar reads, usually `graphify-out/graph.html`, `graphify-out/graph.json`, and `graphify-out/GRAPH_REPORT.md`.
- **Menu bar popover**: the compact BrainBar surface opened from the macOS menu bar.
- **Focus Window**: the larger native BrainBar window for graph exploration and longer inspection.
- **2D graph**: the stable embedded Graphify/vis-network graph view, with BrainBar runtime skin and workflow controls injected at runtime.
- **3D Beta**: the experimental BrainBar-owned 3D graph explorer in the Focus Window. It reads the same local graph metadata as 2D but renders through bundled 3D/canvas resources.
- **Source Lens**: the session-only graph edge filter for `All`, `Graphify`, and `Wikilinks`.
- **Review Queue**: a generic local status panel for configured queue or preflight commands. BrainBar displays command output and optional manual actions; it is not the worker.
- **Brain Check**: a configurable local command hook for the user's own vault validation script or CLI. BrainBar does not define what the check means.
- **Graph Check**: a read-only graph maintenance view inside the 2D runtime. It highlights graph-derived signals such as notes needing links, key notes, disconnected groups, and stale key notes when timestamps are available.
- **System Status**: the native app panel that checks local setup state such as vault path, graph file, Graphify command, Git state, Review Queue, and Brain Check configuration.

## User-Facing Terms

- **All**: show every visible graph edge for the current graph mode.
- **Graphify**: show generated Graphify relationships and hide exported wikilinks.
- **Wikilinks**: show wikilinks exported in Graphify metadata. This is the public label for the internal `obsidian` source lens raw value.
- **Open Note**: open the selected node's backing local source file through BrainBar's vault-safe path resolution.
- **Needs Links**: notes with no graph connections in the current graph data.
- **Key Notes**: unusually connected notes. They often act as indexes, protocols, dashboards, or central concepts. Avoid calling this user-facing view `Hubs`.
- **Review**: graph-targeted Review Queue items. Items need `source_file` or `node_id` to appear in this view.
- **Recent**: recently changed or date-named notes. It uses file modification time when available, otherwise dates found in node labels or paths.
- **Graph Check**: the readable, user-facing name for graph health diagnostics.
- **Focus**: in 3D, focus the selected node and dim surrounding graph context.
- **Depth 1 / Depth 2 / Depth 3**: expand the 3D focus orbit by BFS depth from the selected node.
- **Start path**: arm the selected node as the source for a 3D shortest path trace. The user then clicks another node to trace the route.
- **Shortest path**: the shortest visible unweighted path between two selected nodes in the current 3D graph view.
- **Explain Path**: a deterministic, local-only explanation of a 3D shortest path using visible graph metadata such as edge provenance, communities, labels, and bridge nodes.
- **Path Compare**: a 3D path panel control for comparing deterministic route variants between the same selected source and target.
- **Best explained path**: a Path Compare variant that prefers routes with clearer Wikilink or Graphify metadata. It is still deterministic graph analysis, not semantic proof.

## Internal Architecture Terms

- **`GraphSourceLens`**: Swift enum with raw values `all`, `graphify`, and `obsidian`. Keep `obsidian` as the compatibility raw value, but use `Wikilinks` as the public label.
- **`GraphViewMode`**: Swift enum for `2D` and `3D` Focus Window modes.
- **`GraphWebView`**: Swift WebKit bridge for the stable 2D graph. It loads generated `graph.html`, injects BrainBar runtime JS/CSS, applies Source Lens state, sends node open actions, and forwards Review Queue graph targets.
- **`Graph3DWebView`**: Swift WebKit bridge for the 3D renderer. It serves bundled `Graph3D` resources through the `brainbar3d://` scheme and injects local `graph.json` data.
- **2D runtime**: `BrainBar/Resources/Graph2D/brainbar-graph-runtime.js`. It augments generated Graphify HTML at runtime and must not rewrite `graph.html`.
- **3D runtime**: `BrainBar/Resources/Graph3D/graph3d.js`. It owns the 3D explorer's session state, rendering, focus orbit, path mode, and sidebar behavior.
- **Path utilities**: `BrainBar/Resources/Graph3D/graph3d-path-utils.mjs`. It contains reusable 3D path logic such as unweighted shortest-path BFS.
- **Path variants**: runtime-only 3D path results for `Shortest visible`, `Best explained`, `Wikilinks only`, and `Graphify only`.
- **Edge provenance**: runtime classification for a connection as `Wikilink`, `Graphify`, or `Unknown`, based on Graphify metadata and exported wikilink data.
- **Review Queue status payload**: JSON printed by a configured local status command. Required shape includes `pending_count`; `items` are optional.
- **Review Queue graph targets**: optional item fields `source_file` and `node_id` used only to highlight matching graph nodes.
- **Brain KG**: a generic term for a generated or advisory knowledge graph produced by a user's local vault workflow. In BrainBar docs, avoid treating it as a required product subsystem unless code/config explicitly wires it through local commands.

## Do Not Confuse

- **BrainBar is not Graphify.** BrainBar embeds and controls Graphify output; Graphify generates the graph.
- **BrainBar is not the vault.** It reads local files and opens source notes, but the vault remains user-owned.
- **2D graph is not 3D Beta.** 2D is the stable embedded Graphify path. 3D Beta is a separate BrainBar-owned renderer.
- **Source Lens is not Graph View Mode.** Source Lens filters edge provenance. Graph View Mode switches between 2D and 3D.
- **Wikilinks is not a new raw value.** The internal raw value remains `obsidian`; the public label is `Wikilinks`.
- **Graph Check is not Brain Check.** Graph Check is built from graph data in the viewer. Brain Check is a configurable external command hook.
- **Review Queue is not an automation engine.** It displays local status and can run explicit manual actions; the background watcher only checks status.
- **Shortest path is not semantic proof.** It is an unweighted route through currently visible graph edges, not an AI explanation or claim of causality.
- **Explain Path is not AI reasoning.** It summarizes visible graph metadata conservatively and should not invent meaning beyond the current path data.
- **Best explained is not most true.** It prefers available connection metadata and should not be described as the only meaningful path.
- **3D Beta is not a release-stable default unless explicitly promoted.** Keep language conservative unless product docs and QA criteria change.
- **Brain KG is not a public dependency.** Treat it as optional local/generated context unless a concrete integration is present.

## Agent Rules

- Read this file before renaming product concepts, changing graph terminology, or writing public-facing BrainBar docs.
- Prefer the user-facing names in this file for UI copy and docs.
- Preserve existing compatibility raw values such as `GraphSourceLens.obsidian` unless the user explicitly asks for a migration.
- Do not add alternate labels such as `Obsidian Lens`, `Hub View`, `Health`, `Queue`, or `3D Main` unless the product vocabulary is intentionally updated here first.
- Keep docs public-safe: no personal vault paths, private note names, credentials, local screenshots with private content, or machine-specific assumptions.
- Do not imply BrainBar writes to the vault unless code explicitly does so. Current graph views and lenses are runtime/session-only.
- When adding features, update this file if the feature introduces a durable concept users or agents must reuse.

## Open Terms To Clarify

- Whether `3D Beta` should eventually become `3D` or another stable product name.
- Whether `Brain Check` should remain a generic hook or gain an official default contract.
- Whether `Graph Check` findings should stay read-only or eventually become guided workflows.
- Whether `Brain KG` should stay an external/local workflow term or become a documented BrainBar integration point.
- Whether `Review Queue` should keep its generic name or split into more specific public workflows later.
