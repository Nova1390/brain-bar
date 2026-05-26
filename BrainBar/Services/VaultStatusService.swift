import AppKit
import Foundation

struct VaultStatusService: Sendable {
    func status(for config: BrainBarConfig) async -> VaultStatus {
        guard let vaultURL = vaultURL(for: config) else {
            return .empty
        }

        let vaultExists = directoryExists(vaultURL)
        let branch = vaultExists ? await runGit(["branch", "--show-current"], in: vaultURL) : nil
        let dirtyOutput = vaultExists ? await runGit(["status", "--porcelain"], in: vaultURL) : nil
        let isGitRepo = branch != nil || dirtyOutput != nil
        let graphURL = resolvedURL(config.graphHtmlRelativePath, in: vaultURL)
        let graphExists = FileManager.default.fileExists(atPath: graphURL.path)

        return VaultStatus(
            vaultPath: vaultURL.path,
            vaultExists: vaultExists,
            dashboardExists: FileManager.default.fileExists(atPath: resolvedURL(config.projectDashboardRelativePath, in: vaultURL).path),
            graphHtmlExists: graphExists,
            graphHtmlModifiedAt: graphExists ? modificationDate(for: graphURL) : nil,
            graphReportExists: FileManager.default.fileExists(atPath: resolvedURL(config.graphReportRelativePath, in: vaultURL).path),
            gitBranch: branch?.trimmingCharacters(in: .whitespacesAndNewlines),
            gitDirty: isGitRepo ? !(dirtyOutput?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true) : nil
        )
    }

    func vaultURL(for config: BrainBarConfig) -> URL? {
        let path = config.vaultPath.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !path.isEmpty else {
            return nil
        }
        return URL(fileURLWithPath: path).standardizedFileURL
    }

    func resolvedURL(_ relativePath: String, in vaultURL: URL) -> URL {
        if relativePath.hasPrefix("/") {
            return URL(fileURLWithPath: relativePath).standardizedFileURL
        }
        return vaultURL.appendingPathComponent(relativePath).standardizedFileURL
    }

    func openVault(_ config: BrainBarConfig) throws {
        let vaultURL = try requireVaultURL(config)
        NSWorkspace.shared.activateFileViewerSelecting([vaultURL])
    }

    func openRelativeFile(_ relativePath: String, config: BrainBarConfig) throws {
        let vaultURL = try requireVaultURL(config)
        let fileURL = resolvedURL(relativePath, in: vaultURL)
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            throw BrainBarError.fileMissing(fileURL.path)
        }

        if config.useObsidianURLScheme, let obsidianURL = obsidianURL(for: fileURL) {
            NSWorkspace.shared.open(obsidianURL)
        } else {
            NSWorkspace.shared.open(fileURL)
        }
    }

    private func requireVaultURL(_ config: BrainBarConfig) throws -> URL {
        guard let vaultURL = vaultURL(for: config) else {
            throw BrainBarError.vaultNotConfigured
        }
        guard directoryExists(vaultURL) else {
            throw BrainBarError.vaultMissing(vaultURL.path)
        }
        return vaultURL
    }

    private func directoryExists(_ url: URL) -> Bool {
        var isDirectory: ObjCBool = false
        return FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory) && isDirectory.boolValue
    }

    private func modificationDate(for url: URL) -> Date? {
        let attributes = try? FileManager.default.attributesOfItem(atPath: url.path)
        return attributes?[.modificationDate] as? Date
    }

    private func obsidianURL(for fileURL: URL) -> URL? {
        var components = URLComponents()
        components.scheme = "obsidian"
        components.host = "open"
        components.queryItems = [URLQueryItem(name: "path", value: fileURL.path)]
        return components.url
    }

    private func runGit(_ arguments: [String], in directory: URL) async -> String? {
        let spec = CommandSpec(executable: "git", arguments: arguments, workingDirectory: directory.path)
        let result = try? await CommandRunner().run(spec, name: "git", vaultURL: nil)
        guard let result, result.exitCode == 0 else {
            return nil
        }
        return result.stdout
    }
}
