import AppKit
import Foundation
import Observation

enum GraphSourceLens: String, CaseIterable, Identifiable, Sendable {
    case all
    case graphify
    case obsidian

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all:
            return "All"
        case .graphify:
            return "Graphify"
        case .obsidian:
            return "Obsidian"
        }
    }

    var help: String {
        switch self {
        case .all:
            return "Show every graph edge"
        case .graphify:
            return "Show generated Graphify relationships"
        case .obsidian:
            return "Show native Obsidian wikilinks"
        }
    }
}

enum GraphViewMode: String, CaseIterable, Identifiable, Sendable {
    case twoD
    case threeD

    var id: String { rawValue }

    var label: String {
        switch self {
        case .twoD:
            return "2D"
        case .threeD:
            return "3D Beta"
        }
    }

    var help: String {
        switch self {
        case .twoD:
            return "Show the standard Graphify view"
        case .threeD:
            return "Show the experimental controlled 3D focus graph"
        }
    }
}

enum GraphViewportCommandKind: String, Sendable {
    case fit
    case zoomIn
    case zoomOut
    case topView
    case resetTilt
}

struct GraphViewportCommand: Equatable, Sendable {
    let id: Int
    let kind: GraphViewportCommandKind
}

@MainActor
@Observable
final class AppModel {
    var config: BrainBarConfig
    var status: VaultStatus = .empty
    var lastBrainCheck: CommandResult?
    var lastGraphRefresh: CommandResult?
    var isRefreshingGraph = false
    var isRunningBrainCheck = false
    var errorMessage: String?
    var graphReloadToken = 0
    var graphSourceLens: GraphSourceLens = .all
    var graphViewMode: GraphViewMode = .twoD
    var graph3DResetToken = 0
    var graphViewportCommand: GraphViewportCommand?
    var reviewQueueStatus: ReviewQueueStatus = .empty
    var isCheckingReviewQueue = false
    var isRunningReviewQueueAction = false
    var lastReviewQueueAction: CommandResult?

    @ObservationIgnored private let configurationManager: ConfigurationManager
    @ObservationIgnored private let commandRunner: CommandRunner
    @ObservationIgnored private let vaultStatusService: VaultStatusService
    @ObservationIgnored private let graphServerController: GraphServerController
    @ObservationIgnored private let notificationService: NotificationService
    @ObservationIgnored private let reviewQueueService: ReviewQueueService
    @ObservationIgnored private var nextGraphViewportCommandID = 0
    @ObservationIgnored private var reviewQueueWatcherTask: Task<Void, Never>?

    var configPath: String {
        configurationManager.configURL.path
    }

    var graphServerRunning: Bool {
        graphServerController.isRunning
    }

    var graphServerURL: URL? {
        graphServerController.graphURL(for: config)
    }

    var graphFileURL: URL? {
        guard let vaultURL = vaultStatusService.vaultURL(for: config) else {
            return nil
        }
        return vaultStatusService.resolvedURL(config.graphHtmlRelativePath, in: vaultURL)
    }

    var graphReadAccessURL: URL? {
        graphFileURL?.deletingLastPathComponent()
    }

    var graphRefreshSummary: String {
        if isRefreshingGraph {
            return "Refreshing Graph..."
        }
        if let lastGraphRefresh {
            return lastGraphRefresh.summary
        }
        if let modifiedAt = status.graphHtmlModifiedAt {
            return "Graph updated \(modifiedAt.formattedRelative)"
        }
        return status.graphHtmlExists ? "Graph ready" : "Graphify not run"
    }

    init(
        configurationManager: ConfigurationManager = ConfigurationManager(),
        commandRunner: CommandRunner = CommandRunner(),
        vaultStatusService: VaultStatusService = VaultStatusService(),
        graphServerController: GraphServerController = GraphServerController(),
        notificationService: NotificationService = NotificationService(),
        reviewQueueService: ReviewQueueService = ReviewQueueService()
    ) {
        self.configurationManager = configurationManager
        self.commandRunner = commandRunner
        self.vaultStatusService = vaultStatusService
        self.graphServerController = graphServerController
        self.notificationService = notificationService
        self.reviewQueueService = reviewQueueService
        self.config = (try? configurationManager.loadOrCreate()) ?? .default
        updateReviewQueueWatcher()
    }

    deinit {
        reviewQueueWatcherTask?.cancel()
    }

    func refreshStatus() async {
        status = await vaultStatusService.status(for: config)
        graphReloadToken += 1
        errorMessage = nil
    }

    func reloadGraphView() {
        graphReloadToken += 1
        errorMessage = nil
    }

    func setGraphSourceLens(_ lens: GraphSourceLens) {
        graphSourceLens = lens
        errorMessage = nil
    }

    func setGraphViewMode(_ mode: GraphViewMode) {
        graphViewMode = mode
        errorMessage = nil
    }

    func resetGraph3DCamera() {
        graph3DResetToken += 1
        sendGraphViewportCommand(.topView)
    }

    func resetGraph3DTilt() {
        sendGraphViewportCommand(.resetTilt)
    }

    func fitGraphView() {
        sendGraphViewportCommand(.fit)
    }

    func zoomGraphIn() {
        sendGraphViewportCommand(.zoomIn)
    }

    func zoomGraphOut() {
        sendGraphViewportCommand(.zoomOut)
    }

    func reportGraphRendererIssue(_ message: String) {
        guard !message.isEmpty else {
            return
        }
        errorMessage = "3D graph issue: \(message)"
    }

    private func sendGraphViewportCommand(_ kind: GraphViewportCommandKind) {
        nextGraphViewportCommandID += 1
        graphViewportCommand = GraphViewportCommand(id: nextGraphViewportCommandID, kind: kind)
        errorMessage = nil
    }

    @discardableResult
    func saveConfig(_ newConfig: BrainBarConfig) -> Bool {
        do {
            let normalizedConfig = newConfig.normalized()
            try configurationManager.save(normalizedConfig)
            config = normalizedConfig
            graphReloadToken += 1
            errorMessage = nil
            updateReviewQueueWatcher()
            Task {
                await refreshStatus()
            }
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func openVault() {
        performOpen {
            try vaultStatusService.openVault(config)
        }
    }

    func openProjectDashboard() {
        performOpen {
            try vaultStatusService.openRelativeFile(config.projectDashboardRelativePath, config: config)
        }
    }

    func openGraphifyReport() {
        performOpen {
            try vaultStatusService.openRelativeFile(config.graphReportRelativePath, config: config)
        }
    }

    func openGraph() {
        if graphServerRunning, let url = graphServerURL {
            NSWorkspace.shared.open(url)
            return
        }
        performOpen {
            try vaultStatusService.openRelativeFile(config.graphHtmlRelativePath, config: config)
        }
    }

    func openGraphNode(_ request: GraphNodeOpenRequest) {
        performOpen {
            try vaultStatusService.openGraphNodeSource(request.sourceFile, config: config)
        }
    }

    func refreshGraph(openAfterSuccess: Bool = false) async {
        guard let vaultURL = vaultStatusService.vaultURL(for: config) else {
            errorMessage = BrainBarError.vaultNotConfigured.localizedDescription
            return
        }

        isRefreshingGraph = true
        defer { isRefreshingGraph = false }

        do {
            let result = try await commandRunner.run(config.commands.refreshGraph, name: "Refresh Graph", vaultURL: vaultURL)
            lastGraphRefresh = result
            errorMessage = result.succeeded ? nil : result.summary
            await notificationService.notifyIfEnabled(
                title: "Graph refresh finished",
                body: result.summary,
                enabled: config.notificationsEnabled
            )
            await refreshStatus()
            if result.succeeded, openAfterSuccess {
                graphReloadToken += 1
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func runBrainCheck() async {
        guard let command = config.commands.brainCheck else {
            errorMessage = BrainBarError.commandNotConfigured("Brain check").localizedDescription
            return
        }
        guard let vaultURL = vaultStatusService.vaultURL(for: config) else {
            errorMessage = BrainBarError.vaultNotConfigured.localizedDescription
            return
        }

        isRunningBrainCheck = true
        defer { isRunningBrainCheck = false }

        do {
            let result = try await commandRunner.run(command, name: "Brain Check", vaultURL: vaultURL)
            lastBrainCheck = result
            errorMessage = result.succeeded ? nil : result.summary
            await notificationService.notifyIfEnabled(
                title: "Brain check finished",
                body: result.summary,
                enabled: config.notificationsEnabled
            )
            await refreshStatus()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func refreshReviewQueueStatus() async {
        guard config.reviewQueue.isEnabled else {
            reviewQueueStatus = .empty
            return
        }
        guard !isCheckingReviewQueue else {
            return
        }

        isCheckingReviewQueue = true
        defer { isCheckingReviewQueue = false }

        let vaultURL = vaultStatusService.vaultURL(for: config)
        reviewQueueStatus = await reviewQueueService.check(config: config.reviewQueue.normalized, vaultURL: vaultURL)
    }

    func runReviewQueueAction() async {
        guard config.reviewQueue.isEnabled else {
            return
        }
        guard !isRunningReviewQueueAction else {
            return
        }

        isRunningReviewQueueAction = true
        defer { isRunningReviewQueueAction = false }

        let vaultURL = vaultStatusService.vaultURL(for: config)
        do {
            let result = try await reviewQueueService.runManual(config: config.reviewQueue.normalized, vaultURL: vaultURL)
            lastReviewQueueAction = result
            errorMessage = result.succeeded ? nil : result.summary
            await refreshReviewQueueStatus()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func startOrStopGraphServer() async {
        if graphServerRunning {
            graphServerController.stop()
            return
        }

        guard let vaultURL = vaultStatusService.vaultURL(for: config) else {
            errorMessage = BrainBarError.vaultNotConfigured.localizedDescription
            return
        }

        do {
            try await graphServerController.start(vaultURL: vaultURL, port: config.serverPort)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func performOpen(_ action: () throws -> Void) {
        do {
            try action()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func updateReviewQueueWatcher() {
        reviewQueueWatcherTask?.cancel()
        reviewQueueWatcherTask = nil

        let reviewConfig = config.reviewQueue.normalized
        guard reviewConfig.isEnabled,
              reviewConfig.backgroundWatcherEnabled,
              reviewConfig.preflightCommand != nil else {
            if !reviewConfig.isEnabled {
                reviewQueueStatus = .empty
            }
            return
        }

        reviewQueueWatcherTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refreshReviewQueueStatus()
                try? await Task.sleep(for: .seconds(reviewConfig.watcherIntervalSeconds))
            }
        }
    }
}
