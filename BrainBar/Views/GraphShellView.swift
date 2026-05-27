import AppKit
import SwiftUI

struct GraphShellView: View {
    enum Mode {
        case popover
        case focus

        var showsFocusButton: Bool {
            self == .popover
        }
    }

    let model: AppModel
    let mode: Mode
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        VStack(spacing: 10) {
            header
            graphSurface
            footer
        }
        .padding(mode == .popover ? 12 : 16)
        .background(.regularMaterial)
    }

    private var header: some View {
        HStack(spacing: 10) {
            Label("BrainBar", systemImage: "brain.head.profile")
                .font(.headline.weight(.semibold))
                .labelStyle(.titleAndIcon)

            InlineStatus(text: model.status.gitDescription, systemImage: "point.3.connected.trianglepath.dotted")
                .help("Git status for the configured vault")
                .accessibilityHint("Git status for the configured vault, not the BrainBar app repository")

            if model.status.graphHtmlExists {
                GraphLensControl(
                    selectedLens: model.graphSourceLens,
                    onSelect: model.setGraphSourceLens
                )

                if mode == .focus {
                    GraphViewModeControl(
                        selectedMode: model.graphViewMode,
                        onSelect: model.setGraphViewMode
                    )
                }
            }

            Spacer(minLength: 12)

            if mode == .focus, model.status.graphHtmlExists {
                GraphViewportControls(
                    showsTopView: model.graphViewMode == .threeD,
                    onZoomOut: model.zoomGraphOut,
                    onZoomIn: model.zoomGraphIn,
                    onFit: model.fitGraphView,
                    onTopView: model.resetGraph3DCamera,
                    onResetTilt: model.resetGraph3DTilt
                )
            }

            GraphActionMenu(model: model, showsFocusButton: mode.showsFocusButton)

            IconButton(systemImage: "gearshape", help: "Settings") {
                openSettings()
            }

            IconButton(systemImage: model.isRefreshingGraph ? "hourglass" : "arrow.clockwise", help: "Refresh status") {
                Task {
                    await model.refreshStatus()
                }
            }
        }
        .padding(.horizontal, 2)
    }

    @ViewBuilder
    private var graphSurface: some View {
        if model.status.vaultPath.isEmpty {
            EmptyGraphStateView(
                title: "Choose a vault",
                detail: "Connect a local Markdown vault to load its Graphify graph.",
                systemImage: "folder.badge.questionmark",
                buttonTitle: "Choose Vault",
                buttonSystemImage: "folder"
            ) {
                openSettings()
            }
        } else if !model.status.graphHtmlExists {
            EmptyGraphStateView(
                title: "Graph not built",
                detail: "Run Graphify to generate graphify-out/graph.html.",
                systemImage: "point.3.connected.trianglepath.dotted",
                buttonTitle: model.isRefreshingGraph ? "Refreshing..." : "Refresh Graph",
                buttonSystemImage: "arrow.triangle.2.circlepath"
            ) {
                Task {
                    await model.refreshGraph()
                }
            }
        } else if let graphURL = model.graphFileURL, let readAccessURL = model.graphReadAccessURL {
            activeGraphView(graphURL: graphURL, readAccessURL: readAccessURL)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(.black.opacity(0.16))
                .clipShape(.rect(cornerRadius: 10))
                .overlay {
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(.white.opacity(0.08), lineWidth: 1)
                }
        } else {
            EmptyGraphStateView(
                title: "Graph unavailable",
                detail: "BrainBar could not resolve the graph file path.",
                systemImage: "exclamationmark.triangle",
                buttonTitle: "Refresh Status",
                buttonSystemImage: "arrow.clockwise"
            ) {
                Task {
                    await model.refreshStatus()
                }
            }
        }
    }

    @ViewBuilder
    private func activeGraphView(graphURL: URL, readAccessURL: URL) -> some View {
        if mode == .focus, model.graphViewMode == .threeD {
            Graph3DWebView(
                readAccessURL: readAccessURL,
                reloadToken: model.graphReloadToken,
                sourceLens: model.graphSourceLens,
                resetCameraToken: model.graph3DResetToken,
                viewportCommand: model.graphViewportCommand,
                onDiagnostic: model.reportGraphRendererIssue,
                onOpenNode: model.openGraphNode
            )
        } else {
            GraphWebView(
                fileURL: graphURL,
                readAccessURL: readAccessURL,
                reloadToken: model.graphReloadToken,
                sourceLens: model.graphSourceLens,
                viewportCommand: model.graphViewportCommand,
                onOpenNode: model.openGraphNode
            )
        }
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 14) {
                InlineStatus(text: vaultDisplayName, systemImage: "externaldrive")
                Button {
                    Task {
                        await model.refreshGraph()
                    }
                } label: {
                    InlineStatus(text: model.graphRefreshSummary, systemImage: "arrow.triangle.2.circlepath")
                }
                .buttonStyle(.plain)
                .disabled(model.isRefreshingGraph)
                .help("Refresh Graphify graph")
                if model.config.commands.brainCheck == nil {
                    InlineStatus(text: "Brain Check not configured", systemImage: "checkmark.seal")
                } else {
                    InlineStatus(text: model.lastBrainCheck?.summary ?? "Brain Check not run", systemImage: "checkmark.seal")
                }
                Spacer(minLength: 0)
            }

            if let error = model.errorMessage, !error.isEmpty {
                ErrorBanner(message: error)
            }
        }
    }

    private var vaultDisplayName: String {
        guard !model.status.vaultPath.isEmpty else {
            return "No vault"
        }
        let url = URL(fileURLWithPath: model.status.vaultPath)
        return url.lastPathComponent.isEmpty ? model.status.vaultPath : url.lastPathComponent
    }

    private func openSettings() {
        openWindow(id: "settings")
        BrainBarWindowController.bringSettingsToFront()
    }
}

struct FocusGraphView: View {
    let model: AppModel

    var body: some View {
        GraphShellView(model: model, mode: .focus)
            .frame(minWidth: 900, minHeight: 560)
            .task {
                await model.refreshStatus()
            }
    }
}

private struct GraphActionMenu: View {
    let model: AppModel
    let showsFocusButton: Bool
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        Menu {
            Section("Graph") {
                Button {
                    Task {
                        await model.refreshGraph()
                    }
                } label: {
                    Label(model.isRefreshingGraph ? "Refreshing..." : "Refresh Graph", systemImage: "arrow.triangle.2.circlepath")
                }
                .disabled(model.isRefreshingGraph)

                Button {
                    model.reloadGraphView()
                } label: {
                    Label("Reload View", systemImage: "arrow.clockwise")
                }

                Button {
                    model.openGraph()
                } label: {
                    Label("Open Externally", systemImage: "safari")
                }

                if showsFocusButton {
                    Button {
                        openWindow(id: "graph-focus")
                        BrainBarWindowController.bringFocusGraphToFront()
                    } label: {
                        Label("Open Focus Window", systemImage: "macwindow")
                    }
                }
            }

            Section("Vault") {
                Button {
                    model.openVault()
                } label: {
                    Label("Open Vault Folder", systemImage: "folder")
                }

                if model.status.dashboardExists {
                    Button {
                        model.openProjectDashboard()
                    } label: {
                        Label("Open Dashboard", systemImage: "doc.text")
                    }
                } else {
                    Button {
                        openSettings()
                    } label: {
                        Label("Configure Dashboard Path", systemImage: "doc.badge.gearshape")
                    }
                }

                if model.status.graphReportExists {
                    Button {
                        model.openGraphifyReport()
                    } label: {
                        Label("Open Report", systemImage: "doc.richtext")
                    }
                } else {
                    Button {
                        openSettings()
                    } label: {
                        Label("Configure Report Path", systemImage: "doc.badge.gearshape")
                    }
                }
            }

            Section("Checks") {
                if model.config.commands.brainCheck == nil {
                    Button {
                        openSettings()
                    } label: {
                        Label("Configure Brain Check", systemImage: "checkmark.seal")
                    }
                } else {
                    Button {
                        Task {
                            await model.runBrainCheck()
                        }
                    } label: {
                        Label(model.isRunningBrainCheck ? "Checking..." : "Run Brain Check", systemImage: "checkmark.seal")
                    }
                    .disabled(model.isRunningBrainCheck)
                }
            }

            Section("Advanced") {
                Button {
                    Task {
                        await model.startOrStopGraphServer()
                    }
                } label: {
                    Label(model.graphServerRunning ? "Stop Local Server" : "Start Local Server", systemImage: model.graphServerRunning ? "stop.circle" : "play.circle")
                }

                Button {
                    copyToPasteboard(model.configPath)
                } label: {
                    Label("Copy Config Path", systemImage: "doc.on.doc")
                }
            }

            Divider()

            Button {
                openSettings()
            } label: {
                Label("Settings", systemImage: "gearshape")
            }

            Button("Quit") {
                NSApplication.shared.terminate(nil)
            }
        } label: {
            Image(systemName: "ellipsis.circle")
        }
        .menuStyle(.button)
        .buttonStyle(.borderless)
        .help("Actions")
    }

    private func openSettings() {
        openWindow(id: "settings")
        BrainBarWindowController.bringSettingsToFront()
    }

    private func copyToPasteboard(_ text: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
    }
}

private struct GraphLensControl: View {
    let selectedLens: GraphSourceLens
    let onSelect: (GraphSourceLens) -> Void

    var body: some View {
        HStack(spacing: 2) {
            ForEach(GraphSourceLens.allCases) { lens in
                Button {
                    onSelect(lens)
                } label: {
                    Text(lens.label)
                        .font(.caption.weight(.semibold))
                        .lineLimit(1)
                        .frame(minWidth: 54)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .foregroundStyle(selectedLens == lens ? .primary : .secondary)
                .background {
                    if selectedLens == lens {
                        Capsule()
                            .fill(.white.opacity(0.12))
                            .overlay {
                                Capsule()
                                    .stroke(.white.opacity(0.08), lineWidth: 1)
                            }
                    }
                }
                .help(lens.help)
                .accessibilityLabel(lens.label)
                .accessibilityHint(lens.help)
            }
        }
        .padding(3)
        .background(.thinMaterial, in: Capsule())
        .overlay {
            Capsule()
                .stroke(.white.opacity(0.06), lineWidth: 1)
        }
    }
}

private struct GraphViewModeControl: View {
    let selectedMode: GraphViewMode
    let onSelect: (GraphViewMode) -> Void

    var body: some View {
        HStack(spacing: 2) {
            ForEach(GraphViewMode.allCases) { mode in
                Button {
                    onSelect(mode)
                } label: {
                    Text(mode.label)
                        .font(.caption.weight(.semibold))
                        .lineLimit(1)
                        .frame(minWidth: 34)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .foregroundStyle(selectedMode == mode ? .primary : .secondary)
                .background {
                    if selectedMode == mode {
                        Capsule()
                            .fill(.white.opacity(0.12))
                            .overlay {
                                Capsule()
                                    .stroke(.white.opacity(0.08), lineWidth: 1)
                            }
                    }
                }
                .help(mode.help)
                .accessibilityLabel(mode.label)
                .accessibilityHint(mode.help)
            }
        }
        .padding(3)
        .background(.thinMaterial, in: Capsule())
        .overlay {
            Capsule()
                .stroke(.white.opacity(0.06), lineWidth: 1)
        }
    }
}

private struct GraphViewportControls: View {
    let showsTopView: Bool
    let onZoomOut: () -> Void
    let onZoomIn: () -> Void
    let onFit: () -> Void
    let onTopView: () -> Void
    let onResetTilt: () -> Void

    var body: some View {
        HStack(spacing: 4) {
            IconButton(systemImage: "minus.magnifyingglass", help: "Zoom out", action: onZoomOut)
            IconButton(systemImage: "plus.magnifyingglass", help: "Zoom in", action: onZoomIn)
            IconButton(systemImage: "arrow.up.left.and.down.right.magnifyingglass", help: "Fit graph", action: onFit)
            if showsTopView {
                IconButton(systemImage: "viewfinder", help: "Top view", action: onTopView)
                IconButton(systemImage: "rotate.3d", help: "Reset tilt", action: onResetTilt)
            }
        }
        .padding(.horizontal, 2)
    }
}

private struct InlineStatus: View {
    let text: String
    let systemImage: String

    var body: some View {
        if !text.isEmpty {
            Label(text, systemImage: systemImage)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary.opacity(0.88))
                .symbolRenderingMode(.hierarchical)
                .lineLimit(1)
                .truncationMode(.middle)
        }
    }
}

private struct IconButton: View {
    let systemImage: String
    let help: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 14, weight: .medium))
                .frame(width: 26, height: 26)
        }
        .buttonStyle(.plain)
        .foregroundStyle(.secondary)
        .background(.thinMaterial, in: Circle())
        .overlay {
            Circle()
                .stroke(.white.opacity(0.06), lineWidth: 1)
        }
        .help(help)
    }
}

private struct EmptyGraphStateView: View {
    let title: String
    let detail: String
    let systemImage: String
    let buttonTitle: String
    let buttonSystemImage: String
    let action: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: systemImage)
                .font(.system(size: 42, weight: .regular))
                .foregroundStyle(.secondary)
            Text(title)
                .font(.headline)
            Text(detail)
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button(action: action) {
                Label(buttonTitle, systemImage: buttonSystemImage)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
            .disabled(buttonTitle == "Refreshing...")
        }
        .padding(28)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.black.opacity(0.20), in: .rect(cornerRadius: 10))
        .overlay {
            RoundedRectangle(cornerRadius: 10)
                .stroke(.white.opacity(0.08), lineWidth: 1)
        }
    }
}

private struct ErrorBanner: View {
    let message: String

    var body: some View {
        Label(message, systemImage: "exclamationmark.triangle.fill")
            .font(.caption)
            .foregroundStyle(.red)
            .lineLimit(2)
            .textSelection(.enabled)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.red.opacity(0.10), in: .rect(cornerRadius: 8))
            .overlay {
                RoundedRectangle(cornerRadius: 8)
                    .stroke(.red.opacity(0.16), lineWidth: 1)
            }
    }
}
