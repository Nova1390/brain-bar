# BrainBar Quality And Performance Audit - 2026-05

Release-gate audit for BrainBar on the `brainbar-v0.5-2d-premium-polish` branch.

This report is intentionally public-safe: it does not include private vault paths, note contents, tokens, or local configuration values.

## Executive Summary

BrainBar is in a good state for core local-first behavior: build, unit tests, public-safety scan, packaging script structure, installer defaults, and core path-safety tests are passing. No P0 release blocker was found in build correctness or public repository safety.

The main release risk is performance and maintainability around the graph surfaces. SwiftUI itself was not the top runtime suspect in the trace. The highest-risk areas are the 2D WebKit runtime injection and the experimental 3D renderer, both of which still carry large graph-wide loops and global data updates. The 2D view should remain the stable release path; `3D Beta` should stay beta until it has a repeatable renderer harness and measured interaction budget.

Recommended release gate:

- Merge only if the release notes clearly call 2D stable and 3D beta.
- Do not promote `3D Beta` as the primary README/demo path yet.
- Before the next public release, fix or accept the P1 items below.
- Add automated smoke coverage for WebKit/JS graph behavior before adding more graph features.

## Evidence Collected

Static checks:

- `scripts/check-public-safety.sh`: passed.
- `git diff --check`: passed.
- `node --check BrainBar/Resources/Graph3D/graph3d.js`: passed.
- Complexity scan: flagged `BrainBar/Resources/Graph3D/graph3d.js` as the dominant complexity/performance hotspot, with secondary maintainability risk in large SwiftUI/WebKit view files.

Build and tests:

- `xcodebuild test -project BrainBar.xcodeproj -scheme BrainBar -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO`: passed, 20 tests.
- `xcodebuild -project BrainBar.xcodeproj -scheme BrainBar -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO build`: passed.

Runtime trace:

- Instruments SwiftUI trace attached to a running BrainBar process for about 16 seconds.
- Trace was mostly passive and should not be treated as a full interaction benchmark.
- Result: 2 app hitches, worst about 167 ms; 0 SwiftUI update events; time profiler showed mostly idle/system/WebKit/CoreAnimation-related work.
- Interpretation: the trace does not prove graph interaction is smooth, but it does lower suspicion that ordinary SwiftUI state churn is the main source of lag. The hot path remains WebKit/JS/canvas/vis-network interaction.

## Findings

### F-01 P1 - 2D Runtime Injection Still Performs Global Graph Updates

Area: `BrainBar/Views/GraphWebView.swift`

Evidence:

- Source Lens calls `edgesDS.update(...)` over every original edge and `nodesDS.update(...)` over every original node.
- Runtime theming calls `nodesDS.update(themedNodes)` and `edgesDS.update(themedEdges)` for the full graph.
- Fallback community filtering can update every node in a community and redraw the network.

Impact:

Large vaults can experience lag during view load, reload, lens switching, and community toggles. This also explains why 2D can feel heavy even when the visible UI is simple.

Probable cause:

BrainBar is applying product polish at runtime on top of Graphify's generated vis-network page. That keeps Graphify output immutable, but it means the app mutates vis-network DataSets after load. DataSet-wide updates are expensive at graph sizes above a few thousand edges.

Recommended fix:

- Keep the Graphify file immutable, but move BrainBar's 2D runtime code into a resource JS file that can be linted and tested.
- Replace full DataSet theme updates with one-time option changes where possible.
- For Source Lens, compute a diff and update only changed hidden states.
- Avoid `network.fit` during lens changes unless the user explicitly asks for fit.
- Add performance counters around lens switch and theme apply duration.

Fix risk:

Medium. Lens filtering and community filtering are user-visible, so the fix needs a fixture graph and regression checks.

Required tests:

- JS smoke test for Source Lens with a fixture graph.
- Manual QA with large graph: load, lens switch, hover, search, Open Note.
- Compare before/after lens switch time and perceived hitches.

### F-02 P1 - 3D Beta Renderer Is A Large Monolith With Hot Interaction Loops

Area: `BrainBar/Resources/Graph3D/graph3d.js`

Evidence:

- File size is about 1,700 lines.
- Complexity scan highlights repeated nested and callback-heavy loops in layout, mesh rebuild, static visual layer rebuild, active overlay, label placement, hover trails, edge picking, and sidebar rendering.
- Edge picking walks visible edges and samples curved segments.
- Label placement sorts active candidates and checks overlaps each active frame.
- Ambient motion redraws a canvas overlay on a timer.

Impact:

The 3D view can look good at rest, but pan/zoom/hover may lag on large graphs. The renderer has several independent ways to consume the frame budget, making regressions easy to introduce.

Probable cause:

The renderer evolved quickly from failed WebGL visibility experiments into a hybrid Three.js projection plus Canvas 2D visual layer. That stabilized visibility but concentrated layout, interaction, rendering, picking, and sidebar responsibilities in one file.

Recommended fix:

- Split data preparation, layout, projection cache, picking, rendering, and sidebar into separate modules.
- Add a spatial index for node and edge picking.
- Cache projected curved edge paths until camera or graph changes.
- Throttle pointer move work and avoid full edge scans on every hover.
- Add a reduced-quality mode for large graphs: fewer active labels, no ambient motion, cheaper edge picking.

Fix risk:

Medium-high. The renderer is visual and interaction-heavy; small changes can improve performance but harm feel.

Required tests:

- Browser/WebKit smoke harness for `Graph3D/index.html`.
- Synthetic fixture graphs at small, medium, and large sizes.
- Manual QA with pan/zoom/hover/select on a large graph.
- Runtime trace during active 3D interaction, not just idle.

### F-03 P1 - No Automated Coverage For WebKit Bridge Or JS Renderers

Area: `BrainBarTests/BrainBarTests.swift`, `BrainBar/Views/GraphWebView.swift`, `BrainBar/Views/Graph3DWebView.swift`

Evidence:

- Existing unit tests cover config, command runner, vault status, graph node path safety, graph server, session-only lens/view mode state, and viewport command identity.
- There are no automated tests for injected 2D JavaScript behavior, WebKit message payloads, Source Lens DOM/DataSet effects, 3D renderer load, 3D picking, or installer/package smoke behavior.

Impact:

The riskiest behavior is currently validated mostly by manual screenshots and live testing. That is acceptable for a beta branch, but weak for a release gate.

Probable cause:

Most graph behavior lives inside generated WebKit pages or JS resource files, while the Swift test suite focuses on pure Swift services.

Recommended fix:

- Add a JS test harness that loads fixture graph JSON and verifies lens filtering, node action payload shape, empty states, and renderer startup.
- Add a small Swift test for message payload normalization if practical.
- Add shell smoke tests for `install.sh`, `uninstall.sh`, and `scripts/package-release.sh` in a temporary HOME.

Fix risk:

Low-medium. Tests can be introduced without changing product behavior.

Required tests:

- `node --check` plus dedicated JS behavior tests.
- Installer dry-run or temp HOME smoke script.
- CI job runs JS tests before packaging.

### F-04 P2 - GraphWebView Is Too Large And Embeds A Large Runtime Script In Swift

Area: `BrainBar/Views/GraphWebView.swift`

Evidence:

- File size is about 1,014 lines.
- It contains Swift WebKit setup, node action bridge, metadata injection, CSS skin, tooltip behavior, Source Lens logic, DataSet mutation, and interaction listeners in one Swift string.

Impact:

Reviewing, linting, and testing the 2D runtime code is hard. A syntax or behavior regression inside the embedded JS string is easier to miss than it would be in a standalone resource.

Probable cause:

Runtime injection was the fastest way to keep generated Graphify output untouched while iterating on product polish.

Recommended fix:

- Move the injected JS/CSS to versioned resources such as `Graph2D/brainbar-graph-runtime.js` and `Graph2D/brainbar-graph-theme.css`.
- Keep only payload serialization and WebKit wiring in Swift.
- Run `node --check` against the JS resource in CI.

Fix risk:

Medium. Resource loading and injection timing must remain identical.

Required tests:

- 2D graph loads from file URL.
- Source Lens switches.
- Open Note bridge still fires.
- Tooltip replacement remains idempotent after reload.

### F-05 P2 - Focus Window Layout Has No Automated Visual Acceptance Gate

Area: `BrainBar/Views/GraphShellView.swift`, 2D embedded Graphify view

Evidence:

- User-visible regressions have included graph area framing, sidebar dominance, and the 2D graph feeling square or poorly fit in a wide Focus Window.
- The current code frames the graph surface well from SwiftUI, but the 2D graph layout is controlled by the embedded Graphify/vis-network page and BrainBar runtime injection.

Impact:

The app can pass unit tests while the actual graph wastes space or feels visually wrong. This is especially risky because the product is highly visual.

Probable cause:

No screenshot/canvas-pixel verification exists for focus window proportions or graph fit after load, reload, and lens switching.

Recommended fix:

- Add a manual-to-automated visual QA checklist first, then a screenshot smoke test if practical.
- Define acceptance criteria: graph visible within 2 seconds, uses wide viewport, no native white tooltip, sidebar not wider than intended, stats visible.
- Add an explicit user-triggered fit action for 2D and avoid automatic fits that cause hitches.

Fix risk:

Low-medium. Visual tests can be flaky, but even a coarse smoke check catches blank/square regressions.

Required tests:

- Focus Window 2D screenshot at standard desktop size.
- Source Lens screenshots for All, Graphify, Obsidian.
- Verify graph remains visible after reload and after switching back from 3D Beta.

### F-06 P2 - Window Activation And File Picker Behavior Needs A macOS Policy Decision

Area: `BrainBar/BrainBarApp.swift`, `BrainBar/Views/GraphShellView.swift`, settings/file picker flow

Evidence:

- The app now creates a normal Focus Window and explicitly brings Settings/Focus windows forward.
- `Info.plist` does not declare `LSUIElement`.
- `BrainBarWindowController` uses delayed window lookup by title and `orderFrontRegardless`.
- Previous manual QA found Settings and file access dialogs could appear behind the graph window.

Impact:

If users cannot find BrainBar in the Dock/app switcher, or if permission/file picker dialogs appear behind the focus window, setup feels broken even if the underlying config code works.

Probable cause:

BrainBar is transitioning from menu-bar-only utility to hybrid menu bar plus real Focus Window. That changes the correct macOS activation policy.

Recommended fix:

- Decide explicitly: either accessory/menu-bar-only, or regular app with Dock presence when Focus Window is used.
- If regular app is intended, keep `LSUIElement` absent and document Dock behavior.
- Replace title-based window lookup with a more robust window accessor if the app grows more windows.
- Add manual QA for Settings, file picker, privacy prompt, app switcher, and Dock.

Fix risk:

Medium. Activation policy changes affect product identity and distribution expectations.

Required tests:

- Open Settings from popover and Focus Window.
- Choose Vault from Settings after reinstall/update.
- Open Focus Window from popover and confirm popover closes.
- Verify Dock/app switcher behavior matches the documented decision.

### F-07 P2 - Release Packaging Is Functional But Not Yet Hardened

Area: `install.sh`, `uninstall.sh`, `scripts/package-release.sh`, `.github/workflows/release.yml`

Evidence:

- Installer downloads `BrainBar.zip`, installs into `~/Applications` by default, and preserves config unless missing.
- Release workflow runs safety check, tests, package script, and uploads `BrainBar.zip`.
- Package script ad-hoc signs and verifies the app.
- Installer does not verify checksums or signatures beyond GitHub transport.
- Workflow does not notarize.

Impact:

The v1/v0.x release path is acceptable for an early public tool, but not yet production-grade for trust and frictionless install.

Probable cause:

The planned v1 distribution intentionally prioritized a simple GitHub Release installer before Homebrew and notarization.

Recommended fix:

- Keep current path for beta releases.
- Add SHA256 publication/checking in release notes or installer.
- Add Developer ID signing and notarization before calling the release production-ready.
- Add a temp HOME installer smoke test in CI.

Fix risk:

Low-medium. Notarization setup requires Apple credentials and CI secrets.

Required tests:

- Install/update/uninstall in a temporary HOME.
- Release zip contains exactly `BrainBar.app`.
- Config is created only if missing.
- Reinstall with existing config preserves config.

### F-08 P3 - Complexity Scanner Flags Swift False Positives, But File Size Still Matters

Area: `BrainBar/AppModel.swift`, `BrainBar/Views/GraphShellView.swift`, Swift services

Evidence:

- Complexity scan surfaced some Swift lines that are likely false positives from closures or UI declarations.
- File-size evidence still shows `GraphShellView.swift` at about 591 lines and `AppModel.swift` at about 335 lines.

Impact:

Not an immediate release blocker, but future UI changes will be slower and riskier if view files continue to accumulate responsibilities.

Probable cause:

The app has evolved quickly through design iterations, and the shell now includes toolbar, footer, actions menu, empty states, graph switching, and focus behavior.

Recommended fix:

- Split only when changing the area next: action menu, viewport toolbar, footer/status, empty states.
- Do not refactor before release unless a related bug requires touching the file.

Fix risk:

Low if done opportunistically; unnecessary churn if done now.

Required tests:

- Existing Swift tests.
- Manual QA for popover, Focus Window, Settings, graph controls.

## Performance Baseline

Current measured baseline:

- Unit test suite: 20 tests, passing.
- Build: passing.
- Passive Instruments trace: 16 seconds, 2 hitches, worst about 167 ms, no SwiftUI update events.
- Static JS complexity: highest risk in 3D renderer hot loops and 2D DataSet-wide updates.

Known limitations:

- The trace was not a controlled pan/zoom/hover/search/lens-switch benchmark.
- It did not isolate 2D vs 3D interaction cost.
- It did not compare original Graphify HTML without BrainBar runtime injection.

Recommended benchmark protocol:

1. Launch BrainBar with a fixture graph, not a private vault.
2. Record 20 seconds idle in 2D Focus Window.
3. Record 20 seconds 2D pan/zoom/hover/lens switch.
4. Record 20 seconds 3D Beta pan/zoom/hover/select.
5. Record original Graphify HTML in a browser as control.
6. Report hitches, main-thread samples, memory, and user-perceived jank.

## Code Quality And Maintainability

Strong points:

- Core Swift services are cleanly separated: config, command runner, vault status, graph server, notifications.
- Graph node source opening has path traversal protections and unit tests.
- Session-only state for Source Lens and Graph View Mode is tested.
- Public-safety scan is present and enforced in release workflow.

Weak points:

- 2D runtime injection is too large to live inside a Swift string long-term.
- 3D renderer mixes layout, rendering, picking, interaction, and sidebar rendering.
- No automated JS behavior tests exist.
- Visual product regressions currently rely on manual detection.

## SwiftUI And macOS Correctness

What looks good:

- `AppModel` is `@MainActor`, which is appropriate for UI state.
- Long-running commands use async functions and do not shell out through arbitrary shell strings.
- Settings and Focus windows now have explicit fronting behavior.

Risks to watch:

- Title-based window lookup is fragile if window titles change.
- macOS app activation policy needs to stay aligned with the product: pure menu-bar app vs real focus-window app.
- File picker and privacy prompts need manual QA after each packaging/install change.

## WebKit Bridge And Runtime Security

What looks good:

- WebKit message payloads are narrow and open local source files through Swift path resolution.
- 3D uses a custom local URL scheme for bundled resources.
- Graphify output is not rewritten.
- Public safety scan blocks obvious local absolute user paths and common token patterns.

Risks to watch:

- Graph JSON is injected into JS as page global data. This is acceptable for local-first behavior, but it means the graph renderer should be treated as trusted local UI, not a hardened browser sandbox.
- The 2D runtime mutates generated page globals such as `network`, `nodesDS`, and `edgesDS`; if Graphify output changes names or lifecycle timing, BrainBar can silently degrade.

Recommended guard:

- Add explicit runtime version/shape checks and visible diagnostics when expected Graphify globals are missing.
- Keep graph renderer resources local and avoid CDN dependencies.

## Release, Install, And Public Readiness

Ready:

- Public safety scan passes.
- README documents local-first behavior, Graphify relationship, installer/update/uninstall, unsigned/ad-hoc approval, Brain Check, Source Lens, and 3D Beta.
- GitHub release workflow exists and packages `BrainBar.zip`.
- Installer preserves config and avoids sudo by default.

Not production-ready yet:

- No notarization.
- No checksum verification in installer.
- No installer/uninstaller smoke tests in CI.
- 3D Beta should not be marketed as stable.

## Recommended Fix Milestones

### Milestone A - Release Gate Hardening

- Add JS fixture smoke tests for 2D Source Lens and 3D renderer startup.
- Add installer/uninstaller temp HOME smoke tests.
- Add release checklist that requires manual QA for Settings/file picker/window activation.
- Keep README language conservative around `3D Beta`.

### Milestone B - 2D Stable Performance

- Move 2D runtime JS/CSS out of Swift.
- Reduce full DataSet updates on load and lens switch.
- Add measured lens-switch timings.
- Add screenshot smoke check for Focus Window 2D.

### Milestone C - 3D Beta Performance

- Split `graph3d.js` into modules.
- Add spatial index and projected edge cache.
- Add large-graph quality modes.
- Record interaction traces and define an acceptable frame budget.

### Milestone D - Distribution Trust

- Add SHA256 verification.
- Add Developer ID signing and notarization.
- Prepare Homebrew cask only after notarized releases are consistent.

## Merge Recommendation

Conditionally safe to merge the current branch if the next release is presented as beta-quality for 3D and stable for 2D.

Do not ship a release that positions `3D Beta` as the primary feature until F-02 and F-03 are addressed with measured interaction evidence.

No public-safety blocker was found in this audit.
