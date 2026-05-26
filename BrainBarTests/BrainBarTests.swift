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
