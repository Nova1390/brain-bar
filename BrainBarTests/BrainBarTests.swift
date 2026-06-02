import Darwin
import XCTest
@testable import BrainBar

final class BrainBarTests: XCTestCase {
    func testConfigurationManagerCreatesDefaultWithoutOverwritingExistingFile() throws {
        let directory = try temporaryDirectory()
        let configURL = directory.appendingPathComponent("config.json")
        var manager = ConfigurationManager()
        manager.environment = ["BRAIN_BAR_CONFIG": configURL.path]

        let created = try manager.loadOrCreate()
        XCTAssertEqual(created, .default)
        XCTAssertTrue(FileManager.default.fileExists(atPath: configURL.path))

        var changed = BrainBarConfig.default
        changed.vaultPath = "/tmp/example-vault"
        try manager.save(changed)

        let loaded = try manager.loadOrCreate()
        XCTAssertEqual(loaded.vaultPath, "/tmp/example-vault")
    }

    func testCommandRunnerCapturesSuccessOutput() async throws {
        let spec = CommandSpec(executable: "/bin/echo", arguments: ["hello"], workingDirectory: nil)
        let result = try await CommandRunner().run(spec, name: "echo", vaultURL: nil)

        XCTAssertTrue(result.succeeded)
        XCTAssertEqual(result.stdout.trimmingCharacters(in: .whitespacesAndNewlines), "hello")
        XCTAssertEqual(result.exitCode, 0)
    }

    func testCommandRunnerCapturesFailureOutput() async throws {
        let spec = CommandSpec(executable: "/bin/sh", arguments: ["-c", "echo nope >&2; exit 7"], workingDirectory: nil)
        let result = try await CommandRunner().run(spec, name: "failure", vaultURL: nil)

        XCTAssertFalse(result.succeeded)
        XCTAssertEqual(result.exitCode, 7)
        XCTAssertEqual(result.stderr.trimmingCharacters(in: .whitespacesAndNewlines), "nope")
    }

    func testVaultStatusResolvesFilesAndGitDirtyState() async throws {
        let vault = try temporaryDirectory()
        try "dashboard".write(to: vault.appendingPathComponent("Project Dashboard.md"), atomically: true, encoding: .utf8)
        try FileManager.default.createDirectory(at: vault.appendingPathComponent("graphify-out"), withIntermediateDirectories: true)
        try "graph".write(to: vault.appendingPathComponent("graphify-out/graph.html"), atomically: true, encoding: .utf8)
        try "report".write(to: vault.appendingPathComponent("graphify-out/GRAPH_REPORT.md"), atomically: true, encoding: .utf8)
        _ = try await CommandRunner().run(CommandSpec(executable: "git", arguments: ["init"], workingDirectory: vault.path), name: "git", vaultURL: nil)
        try "dirty".write(to: vault.appendingPathComponent("dirty.md"), atomically: true, encoding: .utf8)

        var config = BrainBarConfig.default
        config.vaultPath = vault.path
        let status = await VaultStatusService().status(for: config)

        XCTAssertTrue(status.vaultExists)
        XCTAssertTrue(status.dashboardExists)
        XCTAssertTrue(status.graphHtmlExists)
        XCTAssertTrue(status.graphReportExists)
        XCTAssertEqual(status.gitDirty, true)
    }

    func testVaultGitDescriptionNamesVaultAndAvoidsDirtyLabel() {
        let status = VaultStatus(
            vaultPath: "/tmp/example-vault",
            vaultExists: true,
            dashboardExists: false,
            graphHtmlExists: false,
            graphHtmlModifiedAt: nil,
            graphReportExists: false,
            gitBranch: "main",
            gitDirty: true
        )

        XCTAssertEqual(status.gitDescription, "Vault · main · changes")
    }

    func testGraphNodeSourceResolvesRelativePathInsideVault() throws {
        let vault = try temporaryDirectory()
        let noteURL = vault.appendingPathComponent("Notes/Example.md")
        try FileManager.default.createDirectory(at: noteURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try "note".write(to: noteURL, atomically: true, encoding: .utf8)

        var config = BrainBarConfig.default
        config.vaultPath = vault.path

        let resolved = try VaultStatusService().resolvedGraphNodeSourceURL("Notes/Example.md", config: config)

        XCTAssertEqual(resolved.path, noteURL.standardizedFileURL.path)
    }

    func testGraphNodeSourceResolvesAbsolutePathInsideVault() throws {
        let vault = try temporaryDirectory()
        let noteURL = vault.appendingPathComponent("Example.md")
        try "note".write(to: noteURL, atomically: true, encoding: .utf8)

        var config = BrainBarConfig.default
        config.vaultPath = vault.path

        let resolved = try VaultStatusService().resolvedGraphNodeSourceURL(noteURL.path, config: config)

        XCTAssertEqual(resolved.path, noteURL.standardizedFileURL.path)
    }

    func testGraphNodeSourceRejectsParentTraversalOutsideVault() throws {
        let vault = try temporaryDirectory()
        var config = BrainBarConfig.default
        config.vaultPath = vault.path

        XCTAssertThrowsError(try VaultStatusService().resolvedGraphNodeSourceURL("../outside.md", config: config)) { error in
            XCTAssertEqual(error as? BrainBarError, .graphNodeSourceOutsideVault("../outside.md"))
        }
    }

    func testGraphNodeSourceRejectsAbsolutePathOutsideVault() throws {
        let vault = try temporaryDirectory()
        let outsideURL = try temporaryDirectory().appendingPathComponent("Outside.md")
        try "outside".write(to: outsideURL, atomically: true, encoding: .utf8)
        var config = BrainBarConfig.default
        config.vaultPath = vault.path

        XCTAssertThrowsError(try VaultStatusService().resolvedGraphNodeSourceURL(outsideURL.path, config: config)) { error in
            XCTAssertEqual(error as? BrainBarError, .graphNodeSourceOutsideVault(outsideURL.path))
        }
    }

    func testGraphNodeSourceMissingFileUsesReadableRelativePath() throws {
        let vault = try temporaryDirectory()
        var config = BrainBarConfig.default
        config.vaultPath = vault.path

        XCTAssertThrowsError(try VaultStatusService().resolvedGraphNodeSourceURL("Missing.md", config: config)) { error in
            XCTAssertEqual(error as? BrainBarError, .graphNodeSourceFileMissing("Missing.md"))
        }
    }

    func testGraphNodeOpenURLUsesObsidianForMarkdownWhenEnabled() throws {
        let vault = try temporaryDirectory()
        let noteURL = vault.appendingPathComponent("Note.md")
        try "note".write(to: noteURL, atomically: true, encoding: .utf8)
        var config = BrainBarConfig.default
        config.vaultPath = vault.path
        config.useObsidianURLScheme = true

        let openURL = try VaultStatusService().graphNodeOpenURL(for: "Note.md", config: config)

        XCTAssertEqual(openURL.scheme, "obsidian")
        XCTAssertEqual(openURL.host, "open")
        XCTAssertTrue(openURL.absoluteString.contains("path="))
    }

    func testGraphNodeOpenURLUsesFileURLForNonMarkdownEvenWhenObsidianEnabled() throws {
        let vault = try temporaryDirectory()
        let sourceURL = vault.appendingPathComponent("script.py")
        try "print('ok')".write(to: sourceURL, atomically: true, encoding: .utf8)
        var config = BrainBarConfig.default
        config.vaultPath = vault.path
        config.useObsidianURLScheme = true

        let openURL = try VaultStatusService().graphNodeOpenURL(for: "script.py", config: config)

        XCTAssertEqual(openURL, sourceURL.standardizedFileURL)
    }

    func testGraphSourceLensLabelsAndRawValuesAreStable() {
        XCTAssertEqual(GraphSourceLens.all.rawValue, "all")
        XCTAssertEqual(GraphSourceLens.all.label, "All")
        XCTAssertEqual(GraphSourceLens.graphify.rawValue, "graphify")
        XCTAssertEqual(GraphSourceLens.graphify.label, "Graphify")
        XCTAssertEqual(GraphSourceLens.obsidian.rawValue, "obsidian")
        XCTAssertEqual(GraphSourceLens.obsidian.label, "Obsidian")
    }

    func testGraphViewModeLabelsAndRawValuesAreStable() {
        XCTAssertEqual(GraphViewMode.twoD.rawValue, "twoD")
        XCTAssertEqual(GraphViewMode.twoD.label, "2D")
        XCTAssertEqual(GraphViewMode.threeD.rawValue, "threeD")
        XCTAssertEqual(GraphViewMode.threeD.label, "3D Beta")
    }

    func testGraphViewportCommandRawValuesAreStable() {
        XCTAssertEqual(GraphViewportCommandKind.fit.rawValue, "fit")
        XCTAssertEqual(GraphViewportCommandKind.zoomIn.rawValue, "zoomIn")
        XCTAssertEqual(GraphViewportCommandKind.zoomOut.rawValue, "zoomOut")
        XCTAssertEqual(GraphViewportCommandKind.topView.rawValue, "topView")
        XCTAssertEqual(GraphViewportCommandKind.resetTilt.rawValue, "resetTilt")
    }

    func testReviewQueueWatcherIsOffByDefault() {
        XCTAssertFalse(BrainBarConfig.default.reviewQueue.isEnabled)
        XCTAssertFalse(BrainBarConfig.default.reviewQueue.backgroundWatcherEnabled)
        XCTAssertNil(BrainBarConfig.default.reviewQueue.manualCommand)
    }

    func testReviewQueueNormalizationUsesConservativeWatcherMinimum() {
        var reviewQueue = ReviewQueueConfiguration.default
        reviewQueue.isEnabled = true
        reviewQueue.backgroundWatcherEnabled = true
        reviewQueue.watcherIntervalSeconds = 60

        let normalized = reviewQueue.normalized

        XCTAssertEqual(normalized.watcherIntervalSeconds, 300)
        XCTAssertTrue(normalized.backgroundWatcherEnabled)
    }

    func testReviewQueueNormalizationDisablesWatcherWhenFeatureIsDisabled() {
        var reviewQueue = ReviewQueueConfiguration.default
        reviewQueue.isEnabled = false
        reviewQueue.backgroundWatcherEnabled = true

        let normalized = reviewQueue.normalized

        XCTAssertFalse(normalized.backgroundWatcherEnabled)
        XCTAssertEqual(normalized.watcherIntervalSeconds, 300)
    }

    func testReviewQueueParsesValidJSONWithItems() throws {
        let json = """
        {
          "pending_count": 2,
          "items": [
            { "title": "Draft item", "detail": "Needs manual review" },
            "Loose queue item"
          ]
        }
        """

        let status = try ReviewQueueService.parse(json)

        XCTAssertEqual(status.pendingCount, 2)
        XCTAssertEqual(status.items.count, 2)
        XCTAssertEqual(status.items[0].title, "Draft item")
        XCTAssertEqual(status.items[0].detail, "Needs manual review")
        XCTAssertEqual(status.items[1].title, "Loose queue item")
        XCTAssertNil(status.errorMessage)
    }

    func testReviewQueueRejectsMalformedJSON() {
        XCTAssertThrowsError(try ReviewQueueService.parse("{")) { error in
            XCTAssertEqual(error as? BrainBarError, .processFailed("Review Queue returned invalid JSON."))
        }
    }

    func testReviewQueuePendingZeroIsQuietStatus() throws {
        let status = try ReviewQueueService.parse(#"{ "pending_count": 0 }"#)

        XCTAssertEqual(status.pendingCount, 0)
        XCTAssertTrue(status.items.isEmpty)
        XCTAssertNil(status.errorMessage)
        XCTAssertEqual(status.summary, "0 pending items")
    }

    func testReviewQueuePendingGreaterThanZero() throws {
        let status = try ReviewQueueService.parse(#"{ "pending_count": 3 }"#)

        XCTAssertEqual(status.pendingCount, 3)
        XCTAssertEqual(status.summary, "3 pending items")
    }

    func testReviewQueueCommandTimeoutIsCompact() async throws {
        var reviewQueue = ReviewQueueConfiguration.default
        reviewQueue.isEnabled = true
        reviewQueue.timeoutSeconds = 1
        reviewQueue.preflightCommand = CommandSpec(executable: "/bin/sleep", arguments: ["2"], workingDirectory: nil)

        let status = await ReviewQueueService().check(config: reviewQueue, vaultURL: nil)

        XCTAssertEqual(status.errorMessage, "Review Queue timed out after 1s.")
        XCTAssertNil(status.pendingCount)
        XCTAssertTrue(status.items.isEmpty)
    }

    func testGraphServerStartsAndStops() async throws {
        let vault = try temporaryDirectory()
        try FileManager.default.createDirectory(at: vault.appendingPathComponent("graphify-out"), withIntermediateDirectories: true)
        try "ok".write(to: vault.appendingPathComponent("graphify-out/graph.html"), atomically: true, encoding: .utf8)
        let port = try freePort()
        let controller = GraphServerController()

        try await controller.start(vaultURL: vault, port: port)
        let running = await controller.isRunning
        await controller.stop()
        let stopped = await controller.isRunning

        XCTAssertTrue(running)
        XCTAssertFalse(stopped)
    }

    @MainActor
    func testAppModelSavesConfigToOverridePath() throws {
        let directory = try temporaryDirectory()
        let configURL = directory.appendingPathComponent("config.json")
        var manager = ConfigurationManager()
        manager.environment = ["BRAIN_BAR_CONFIG": configURL.path]
        let model = AppModel(configurationManager: manager)

        var config = model.config
        config.vaultPath = "/tmp/example-vault"
        model.saveConfig(config)

        let saved = try manager.load()
        XCTAssertEqual(saved.vaultPath, "/tmp/example-vault")
    }

    @MainActor
    func testAppModelGraphSourceLensIsSessionOnly() throws {
        let directory = try temporaryDirectory()
        let configURL = directory.appendingPathComponent("config.json")
        var manager = ConfigurationManager()
        manager.environment = ["BRAIN_BAR_CONFIG": configURL.path]
        let model = AppModel(configurationManager: manager)
        let initialConfig = model.config

        model.setGraphSourceLens(.obsidian)

        XCTAssertEqual(model.graphSourceLens, .obsidian)
        XCTAssertEqual(model.config, initialConfig)
    }

    @MainActor
    func testAppModelGraphViewModeIsSessionOnly() throws {
        let directory = try temporaryDirectory()
        let configURL = directory.appendingPathComponent("config.json")
        var manager = ConfigurationManager()
        manager.environment = ["BRAIN_BAR_CONFIG": configURL.path]
        let model = AppModel(configurationManager: manager)
        let initialConfig = model.config

        model.setGraphViewMode(.threeD)

        XCTAssertEqual(model.graphViewMode, .threeD)
        XCTAssertEqual(model.graphSourceLens, .all)
        XCTAssertEqual(model.config, initialConfig)
    }

    @MainActor
    func testAppModelGraphViewportCommandsAreSessionOnly() throws {
        let directory = try temporaryDirectory()
        let configURL = directory.appendingPathComponent("config.json")
        var manager = ConfigurationManager()
        manager.environment = ["BRAIN_BAR_CONFIG": configURL.path]
        let model = AppModel(configurationManager: manager)
        let initialConfig = model.config

        model.zoomGraphIn()
        let firstCommand = model.graphViewportCommand
        model.fitGraphView()
        let secondCommand = model.graphViewportCommand
        model.resetGraph3DTilt()

        XCTAssertEqual(firstCommand?.kind, .zoomIn)
        XCTAssertEqual(secondCommand?.kind, .fit)
        XCTAssertEqual(model.graphViewportCommand?.kind, .resetTilt)
        XCTAssertNotEqual(firstCommand?.id, secondCommand?.id)
        XCTAssertNotEqual(secondCommand?.id, model.graphViewportCommand?.id)
        XCTAssertEqual(model.config, initialConfig)
    }

    private func temporaryDirectory() throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("BrainBarTests")
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    private func freePort() throws -> Int {
        let descriptor = socket(AF_INET, SOCK_STREAM, 0)
        XCTAssertGreaterThanOrEqual(descriptor, 0)
        defer { close(descriptor) }

        var address = sockaddr_in()
        address.sin_family = sa_family_t(AF_INET)
        address.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))
        address.sin_port = 0

        let bindResult = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.bind(descriptor, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        XCTAssertEqual(bindResult, 0)

        var length = socklen_t(MemoryLayout<sockaddr_in>.size)
        let nameResult = withUnsafeMutablePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.getsockname(descriptor, $0, &length)
            }
        }
        XCTAssertEqual(nameResult, 0)
        return Int(UInt16(bigEndian: address.sin_port))
    }
}
