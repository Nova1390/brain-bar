import AppKit
import Foundation
import Observation

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

    @ObservationIgnored private let configurationManager: ConfigurationManager
    @ObservationIgnored private let commandRunner: CommandRunner
    @ObservationIgnored private let vaultStatusService: VaultStatusService
    @ObservationIgnored private let graphServerController: GraphServerController
    @ObservationIgnored private let notificationService: NotificationService

    var configPath: String {
        configurationManager.configURL.path
    }

    var graphServerRunning: Bool {
        graphServerController.isRunning
    }

    var graphServerURL: URL? {
        graphServerController.graphURL(for: config)
    }

    init(
        configurationManager: ConfigurationManager = ConfigurationManager(),
        commandRunner: CommandRunner = CommandRunner(),
        vaultStatusService: VaultStatusService = VaultStatusService(),
        graphServerController: GraphServerController = GraphServerController(),
        notificationService: NotificationService = NotificationService()
    ) {
        self.configurationManager = configurationManager
        self.commandRunner = commandRunner
        self.vaultStatusService = vaultStatusService
        self.graphServerController = graphServerController
        self.notificationService = notificationService
        self.config = (try? configurationManager.loadOrCreate()) ?? .default
    }

    func refreshStatus() async {
        status = await vaultStatusService.status(for: config)
    }

    func saveConfig(_ newConfig: BrainBarConfig) {
        do {
            try configurationManager.save(newConfig)
            config = newConfig
            errorMessage = nil
            Task {
                await refreshStatus()
            }
        } catch {
            errorMessage = error.localizedDescription
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
                openGraph()
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
}
