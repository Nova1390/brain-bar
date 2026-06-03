import AppKit
import SwiftUI

struct GraphShellView: View {
    enum Mode {
        case popover
        case focus

        var isFocus: Bool {
            switch self {
            case .popover:
                return false
            case .focus:
                return true
            }
        }

        var showsFocusButton: Bool {
            switch self {
            case .popover:
                return true
            case .focus:
                return false
            }
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

                if mode.isFocus {
                    GraphViewModeControl(
                        selectedMode: model.graphViewMode,
                        onSelect: model.setGraphViewMode
                    )
                }
            }

            Spacer(minLength: 12)

            if mode.isFocus, model.status.graphHtmlExists {
                GraphViewportControls(
                    showsTopView: model.graphViewMode == .threeD && usesExperimental3DRenderer,
                    onZoomOut: model.zoomGraphOut,
                    onZoomIn: model.zoomGraphIn,
                    onFit: model.fitGraphView,
                    onTopView: model.resetGraph3DCamera,
                    onResetTilt: model.resetGraph3DTilt
                )
            }

            GraphActionMenu(model: model)

            IconButton(systemImage: "gearshape", help: "Settings") {
                openSettings()
            }

            if mode.showsFocusButton {
                IconButton(systemImage: "macwindow", help: "Open Focus Window") {
                    openFocusWindow()
                }
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
                title: "Connect your local graph",
                detail: "Choose a Markdown or Obsidian vault, then let BrainBar check for Graphify output.",
                systemImage: "folder.badge.questionmark",
                buttonTitle: "Choose Vault",
                buttonSystemImage: "folder",
                steps: ["Choose Vault", "Check Graphify Output", "Refresh Graph"]
            ) {
                openSettings()
            }
        } else if !model.status.graphHtmlExists {
            EmptyGraphStateView(
                title: "Graphify output not found",
                detail: "BrainBar is connected to the vault. Generate graphify-out/graph.html to see the graph here.",
                systemImage: "point.3.connected.trianglepath.dotted",
                buttonTitle: model.isRefreshingGraph ? "Refreshing..." : "Refresh Graph",
                buttonSystemImage: "arrow.triangle.2.circlepath",
                steps: ["Vault connected", "Graph file missing", "Run Refresh Graph"]
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
        if mode.isFocus, model.graphViewMode == .threeD && usesExperimental3DRenderer {
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
            ZStack(alignment: .topLeading) {
                GraphWebView(
                    fileURL: graphURL,
                    readAccessURL: readAccessURL,
                    reloadToken: model.graphReloadToken,
                    sourceLens: model.graphSourceLens,
                    onOpenNode: model.openGraphNode
                )

                if mode.isFocus, model.graphViewMode == .threeD {
                    ThreeDFallbackBadge()
                        .padding(12)
                }
            }
        }
    }

    private var usesExperimental3DRenderer: Bool {
        true
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
                if !model.config.reviewQueue.isEnabled {
                    Button {
                        openSettings()
                    } label: {
                        InlineStatus(text: "Configure Review Queue", systemImage: "tray.full")
                    }
                    .buttonStyle(.plain)
                    .help("Configure Review Queue")
                }
                Spacer(minLength: 0)
            }

            if model.config.reviewQueue.isEnabled {
                ReviewQueuePanel(model: model, onConfigure: openSettings)
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

    private func openFocusWindow() {
        openWindow(id: "graph-focus")
        BrainBarWindowController.bringFocusGraphToFront()
        BrainBarWindowController.dismissMenuBarWindow()
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
            }

            SystemStatusMenu(model: model)

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
                if model.config.reviewQueue.isEnabled {
                    Button {
                        Task {
                            await model.refreshReviewQueueStatus()
                        }
                    } label: {
                        Label(model.isCheckingReviewQueue ? "Checking Review Queue..." : "Check Review Queue", systemImage: "tray.full")
                    }
                    .disabled(model.isCheckingReviewQueue || model.config.reviewQueue.preflightCommand == nil)

                    if model.config.reviewQueue.manualCommand != nil {
                        Button {
                            Task {
                                await model.runReviewQueueAction()
                            }
                        } label: {
                            Label(model.isRunningReviewQueueAction ? "Running Review Queue Action..." : "Run Review Queue Action", systemImage: "play.circle")
                        }
                        .disabled(model.isRunningReviewQueueAction)
                    }
                } else {
                    Button {
                        openSettings()
                    } label: {
                        Label("Configure Review Queue", systemImage: "tray.full")
                    }
                }

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

private struct ReviewQueuePanel: View {
    let model: AppModel
    let onConfigure: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 10) {
                InlineStatus(text: "Review Queue", systemImage: "tray.full")
                Text(summaryText)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(statusColor)
                    .lineLimit(1)
                    .truncationMode(.tail)

                if let checkedAt = model.reviewQueueStatus.lastCheckedAt {
                    Text("checked \(checkedAt.formattedRelative)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer(minLength: 0)

                if model.config.reviewQueue.preflightCommand == nil {
                    Button("Configure") {
                        onConfigure()
                    }
                    .buttonStyle(.borderless)
                    .controlSize(.small)
                } else {
                    Button(model.isCheckingReviewQueue ? "Checking..." : "Check") {
                        Task {
                            await model.refreshReviewQueueStatus()
                        }
                    }
                    .buttonStyle(.borderless)
                    .controlSize(.small)
                    .disabled(model.isCheckingReviewQueue)
                }

                if model.config.reviewQueue.manualCommand != nil {
                    Button(model.isRunningReviewQueueAction ? "Running..." : "Run Action") {
                        Task {
                            await model.runReviewQueueAction()
                        }
                    }
                    .buttonStyle(.borderless)
                    .controlSize(.small)
                    .disabled(model.isRunningReviewQueueAction)
                }
            }

            if !model.reviewQueueStatus.items.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(model.reviewQueueStatus.items.prefix(4)) { item in
                        HStack(spacing: 6) {
                            Circle()
                                .fill(.secondary.opacity(0.55))
                                .frame(width: 4, height: 4)
                            Text(item.title)
                                .font(.caption)
                                .foregroundStyle(.primary.opacity(0.9))
                                .lineLimit(1)
                            if let detail = item.detail {
                                Text(detail)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                            }
                        }
                    }
                }
                .padding(.leading, 2)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(.black.opacity(0.12), in: .rect(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(.white.opacity(0.06), lineWidth: 1)
        }
    }

    private var statusColor: Color {
        if model.config.reviewQueue.preflightCommand == nil {
            return .secondary
        }
        if model.reviewQueueStatus.errorMessage != nil {
            return .red
        }
        if let count = model.reviewQueueStatus.pendingCount, count > 0 {
            return .orange
        }
        return .secondary
    }

    private var summaryText: String {
        if model.config.reviewQueue.preflightCommand == nil {
            return "Status command not configured"
        }
        return model.reviewQueueStatus.summary
    }
}

private struct SystemStatusMenu: View {
    let model: AppModel
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        Menu {
            Section("Status") {
                Label(vaultStatusText, systemImage: vaultStatusIcon)
                Label(graphStatusText, systemImage: graphStatusIcon)
                Label(graphifyCommandText, systemImage: graphifyCommandIcon)
                Label(model.status.gitDescription, systemImage: "point.3.connected.trianglepath.dotted")
                Label(reviewQueueStatusText, systemImage: "tray.full")
                Label(brainCheckStatusText, systemImage: "checkmark.seal")
            }

            Section("Actions") {
                if model.status.vaultPath.isEmpty || !model.status.vaultExists {
                    Button {
                        openSettings()
                    } label: {
                        Label("Choose Vault", systemImage: "folder")
                    }
                }

                if model.status.vaultExists && !model.status.graphHtmlExists {
                    Button {
                        Task {
                            await model.refreshGraph()
                        }
                    } label: {
                        Label(model.isRefreshingGraph ? "Refreshing..." : "Refresh Graph", systemImage: "arrow.triangle.2.circlepath")
                    }
                    .disabled(model.isRefreshingGraph)
                }

                if !model.config.reviewQueue.isEnabled || model.config.reviewQueue.preflightCommand == nil || model.config.commands.brainCheck == nil {
                    Button {
                        openSettings()
                    } label: {
                        Label("Open Settings", systemImage: "gearshape")
                    }
                }
            }
        } label: {
            Label("System Status", systemImage: "checklist.checked")
        }
    }

    private var vaultStatusText: String {
        if model.status.vaultPath.isEmpty {
            return "Vault: not configured"
        }
        return model.status.vaultExists ? "Vault: connected" : "Vault: path missing"
    }

    private var vaultStatusIcon: String {
        model.status.vaultExists ? "checkmark.circle" : "exclamationmark.circle"
    }

    private var graphStatusText: String {
        model.status.graphHtmlExists ? "Graph file: ready" : "Graph file: missing"
    }

    private var graphStatusIcon: String {
        model.status.graphHtmlExists ? "checkmark.circle" : "exclamationmark.circle"
    }

    private var graphifyCommandText: String {
        let executable = model.config.commands.refreshGraph.executable.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !executable.isEmpty else {
            return "Graphify command: not configured"
        }
        return commandLooksAvailable(executable) ? "Graphify command: available" : "Graphify command: check PATH"
    }

    private var graphifyCommandIcon: String {
        commandLooksAvailable(model.config.commands.refreshGraph.executable) ? "checkmark.circle" : "exclamationmark.circle"
    }

    private var reviewQueueStatusText: String {
        guard model.config.reviewQueue.isEnabled else {
            return "Review Queue: off"
        }
        guard model.config.reviewQueue.preflightCommand != nil else {
            return "Review Queue: configure status"
        }
        return "Review Queue: \(model.reviewQueueStatus.summary)"
    }

    private var brainCheckStatusText: String {
        guard model.config.commands.brainCheck != nil else {
            return "Brain Check: not configured"
        }
        return "Brain Check: \(model.lastBrainCheck?.summary ?? "not run")"
    }

    private func openSettings() {
        openWindow(id: "settings")
        BrainBarWindowController.bringSettingsToFront()
    }

    private func commandLooksAvailable(_ executable: String) -> Bool {
        let trimmed = executable.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return false
        }

        if trimmed.contains("/") {
            return FileManager.default.isExecutableFile(atPath: trimmed)
        }

        let path = ProcessInfo.processInfo.environment["PATH"] ?? ""
        let candidates = (path.split(separator: ":").map(String.init) + [
            FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".local/bin").path,
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/usr/bin",
            "/bin"
        ])

        return candidates.contains { directory in
            FileManager.default.isExecutableFile(atPath: URL(fileURLWithPath: directory).appendingPathComponent(trimmed).path)
        }
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

private struct ThreeDFallbackBadge: View {
    var body: some View {
        Label("3D Beta paused", systemImage: "pause.circle")
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary.opacity(0.9))
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(.thinMaterial, in: Capsule())
            .overlay {
                Capsule()
                    .stroke(.white.opacity(0.08), lineWidth: 1)
            }
            .help("Using the stable graph renderer while the experimental 3D renderer is under review.")
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
    var steps: [String] = []
    let action: () -> Void

    var body: some View {
        VStack(spacing: 15) {
            Image(systemName: systemImage)
                .font(.system(size: 42, weight: .regular))
                .foregroundStyle(.secondary)
            Text(title)
                .font(.headline)
            Text(detail)
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            if !steps.isEmpty {
                HStack(spacing: 8) {
                    ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                        HStack(spacing: 5) {
                            Text("\(index + 1)")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(.secondary)
                                .frame(width: 17, height: 17)
                                .background(.white.opacity(0.08), in: Circle())
                            Text(step)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .lineLimit(1)
            }
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
