import Foundation

struct BrainBarConfig: Codable, Equatable, Sendable {
    var vaultPath: String
    var projectDashboardRelativePath: String
    var graphHtmlRelativePath: String
    var graphReportRelativePath: String
    var serverPort: Int
    var useObsidianURLScheme: Bool
    var notificationsEnabled: Bool
    var commands: CommandConfiguration

    static let `default` = BrainBarConfig(
        vaultPath: "",
        projectDashboardRelativePath: "Project Dashboard.md",
        graphHtmlRelativePath: "graphify-out/graph.html",
        graphReportRelativePath: "graphify-out/GRAPH_REPORT.md",
        serverPort: 8765,
        useObsidianURLScheme: false,
        notificationsEnabled: false,
        commands: CommandConfiguration(
            refreshGraph: CommandSpec(
                executable: "graphify",
                arguments: ["update", "."],
                workingDirectory: "vault"
            ),
            brainCheck: nil
        )
    )
}

struct CommandConfiguration: Codable, Equatable, Sendable {
    var refreshGraph: CommandSpec
    var brainCheck: CommandSpec?

    enum CodingKeys: String, CodingKey {
        case refreshGraph
        case brainCheck
    }

    init(refreshGraph: CommandSpec, brainCheck: CommandSpec?) {
        self.refreshGraph = refreshGraph
        self.brainCheck = brainCheck
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        refreshGraph = try container.decode(CommandSpec.self, forKey: .refreshGraph)
        brainCheck = try container.decodeIfPresent(CommandSpec.self, forKey: .brainCheck)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(refreshGraph, forKey: .refreshGraph)
        if let brainCheck {
            try container.encode(brainCheck, forKey: .brainCheck)
        } else {
            try container.encodeNil(forKey: .brainCheck)
        }
    }
}

extension BrainBarConfig {
    func normalized() -> BrainBarConfig {
        var config = self
        if config.commands.refreshGraph.executable == "graphify",
           config.commands.refreshGraph.arguments == ["--update", "."] {
            config.commands.refreshGraph.arguments = ["update", "."]
        }
        return config
    }
}

struct CommandSpec: Codable, Equatable, Sendable {
    var executable: String
    var arguments: [String]
    var workingDirectory: String?
}

struct CommandResult: Equatable, Sendable {
    var commandName: String
    var exitCode: Int32
    var stdout: String
    var stderr: String
    var startedAt: Date
    var finishedAt: Date

    var duration: TimeInterval {
        finishedAt.timeIntervalSince(startedAt)
    }

    var succeeded: Bool {
        exitCode == 0
    }

    var summary: String {
        if succeeded {
            return "Succeeded in \(duration.formattedSeconds)"
        }

        let message = stderr.trimmingCharacters(in: .whitespacesAndNewlines)
        if message.isEmpty {
            return "Failed with exit code \(exitCode)"
        }
        return "Failed: \(message)"
    }
}

struct VaultStatus: Equatable, Sendable {
    var vaultPath: String
    var vaultExists: Bool
    var dashboardExists: Bool
    var graphHtmlExists: Bool
    var graphHtmlModifiedAt: Date?
    var graphReportExists: Bool
    var gitBranch: String?
    var gitDirty: Bool?

    static let empty = VaultStatus(
        vaultPath: "",
        vaultExists: false,
        dashboardExists: false,
        graphHtmlExists: false,
        graphHtmlModifiedAt: nil,
        graphReportExists: false,
        gitBranch: nil,
        gitDirty: nil
    )

    var gitDescription: String {
        guard let gitDirty else {
            return "Vault · no Git"
        }
        let branch = gitBranch?.isEmpty == false ? gitBranch! : "detached"
        return gitDirty ? "Vault · \(branch) · changes" : "Vault · \(branch) · clean"
    }
}

struct GraphNodeOpenRequest: Equatable, Sendable {
    var action: String
    var nodeId: String
    var label: String
    var sourceFile: String?
}

enum BrainBarError: LocalizedError, Equatable, Sendable {
    case vaultNotConfigured
    case vaultMissing(String)
    case fileMissing(String)
    case graphNodeSourceMissing
    case graphNodeSourceOutsideVault(String)
    case graphNodeSourceFileMissing(String)
    case commandNotConfigured(String)
    case invalidPort(Int)
    case portBusy(Int)
    case processFailed(String)

    var errorDescription: String? {
        switch self {
        case .vaultNotConfigured:
            return "Vault path is not configured."
        case .vaultMissing(let path):
            return "Vault path does not exist: \(path)"
        case .fileMissing(let path):
            return "File does not exist: \(path)"
        case .graphNodeSourceMissing:
            return "This graph node does not include a source file."
        case .graphNodeSourceOutsideVault(let path):
            return "Graph node source is outside the configured vault: \(path)"
        case .graphNodeSourceFileMissing(let path):
            return "Source file does not exist: \(path)"
        case .commandNotConfigured(let name):
            return "\(name) is not configured."
        case .invalidPort(let port):
            return "Invalid server port: \(port)"
        case .portBusy(let port):
            return "Port \(port) is already in use by another process."
        case .processFailed(let message):
            return message
        }
    }
}

extension TimeInterval {
    var formattedSeconds: String {
        String(format: "%.1fs", self)
    }
}

extension Date {
    var formattedRelative: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        return formatter.localizedString(for: self, relativeTo: Date())
    }
}
