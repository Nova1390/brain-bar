import Foundation

struct ReviewQueueService: Sendable {
    var commandRunner = CommandRunner()

    func check(config: ReviewQueueConfiguration, vaultURL: URL?) async -> ReviewQueueStatus {
        let checkedAt = Date()
        guard config.isEnabled else {
            return .empty
        }
        guard let command = config.preflightCommand else {
            return ReviewQueueStatus(
                pendingCount: nil,
                items: [],
                lastCheckedAt: checkedAt,
                errorMessage: "Review Queue status command is not configured."
            )
        }

        do {
            let result = try await commandRunner.run(
                command,
                name: "Review Queue",
                vaultURL: vaultURL,
                timeoutSeconds: config.timeoutSeconds
            )
            guard result.succeeded else {
                return ReviewQueueStatus(
                    pendingCount: nil,
                    items: [],
                    lastCheckedAt: checkedAt,
                    errorMessage: Self.compactFailureMessage(from: result)
                )
            }
            return try Self.parse(result.stdout, checkedAt: checkedAt)
        } catch {
            return ReviewQueueStatus(
                pendingCount: nil,
                items: [],
                lastCheckedAt: checkedAt,
                errorMessage: Self.compactMessage(error.localizedDescription)
            )
        }
    }

    func runManual(config: ReviewQueueConfiguration, vaultURL: URL?) async throws -> CommandResult {
        guard let command = config.manualCommand else {
            throw BrainBarError.commandNotConfigured("Review Queue action")
        }
        return try await commandRunner.run(
            command,
            name: "Review Queue action",
            vaultURL: vaultURL,
            timeoutSeconds: config.timeoutSeconds
        )
    }

    static func parse(_ json: String, checkedAt: Date = Date()) throws -> ReviewQueueStatus {
        guard let data = json.data(using: .utf8) else {
            throw BrainBarError.processFailed("Review Queue returned invalid JSON.")
        }
        do {
            let payload = try JSONDecoder().decode(ReviewQueuePayload.self, from: data)
            return ReviewQueueStatus(
                pendingCount: max(0, payload.pendingCount),
                items: payload.items ?? [],
                lastCheckedAt: checkedAt,
                errorMessage: nil
            )
        } catch {
            throw BrainBarError.processFailed("Review Queue returned invalid JSON.")
        }
    }

    private static func compactFailureMessage(from result: CommandResult) -> String {
        let stderr = result.stderr.trimmingCharacters(in: .whitespacesAndNewlines)
        if !stderr.isEmpty {
            return compactMessage(stderr)
        }

        let stdout = result.stdout.trimmingCharacters(in: .whitespacesAndNewlines)
        if !stdout.isEmpty {
            return compactMessage(stdout)
        }

        return "Review Queue failed with exit code \(result.exitCode)."
    }

    private static func compactMessage(_ message: String) -> String {
        let firstLine = message
            .split(whereSeparator: \.isNewline)
            .first
            .map(String.init) ?? message
        let trimmed = firstLine.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count > 160 else {
            return trimmed
        }
        return "\(trimmed.prefix(157))..."
    }
}

private struct ReviewQueuePayload: Decodable {
    var pendingCount: Int
    var items: [ReviewQueueItem]?

    enum CodingKeys: String, CodingKey {
        case pendingCount = "pending_count"
        case items
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if let intValue = try? container.decode(Int.self, forKey: .pendingCount) {
            pendingCount = intValue
        } else {
            let doubleValue = try container.decode(Double.self, forKey: .pendingCount)
            pendingCount = Int(doubleValue)
        }
        items = try container.decodeIfPresent([ReviewQueueItem].self, forKey: .items)
    }
}

extension ReviewQueueItem {
    init(from decoder: Decoder) throws {
        if let container = try? decoder.singleValueContainer(),
           let value = try? container.decode(String.self) {
            let title = value.trimmingCharacters(in: .whitespacesAndNewlines)
            self.init(id: title, title: title.isEmpty ? "Untitled item" : title, detail: nil)
            return
        }

        let container = try decoder.container(keyedBy: ReviewQueueItemCodingKeys.self)
        let title = try container.decodeFirstPresentString(for: [.title, .label, .name, .id])
        let normalizedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let detail = try container.decodeFirstPresentStringIfAvailable(for: [.detail, .summary, .status])
        let sourceFile = try container.decodeFirstPresentStringIfAvailable(for: [.sourceFile, .source_file])
        let nodeId = try container.decodeFirstPresentStringIfAvailable(for: [.nodeId, .node_id])
        self.init(
            id: (try? container.decode(String.self, forKey: .id)) ?? normalizedTitle,
            title: normalizedTitle.isEmpty ? "Untitled item" : normalizedTitle,
            detail: detail?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            sourceFile: sourceFile?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            nodeId: nodeId?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        )
    }
}

private enum ReviewQueueItemCodingKeys: String, CodingKey {
    case id
    case title
    case label
    case name
    case detail
    case summary
    case status
    case sourceFile
    case source_file
    case nodeId
    case node_id
}

private extension KeyedDecodingContainer where Key == ReviewQueueItemCodingKeys {
    func decodeFirstPresentString(for keys: [ReviewQueueItemCodingKeys]) throws -> String {
        for key in keys {
            if let value = try decodeFirstPresentStringIfAvailable(for: [key]) {
                return value
            }
        }
        return "Untitled item"
    }

    func decodeFirstPresentStringIfAvailable(for keys: [ReviewQueueItemCodingKeys]) throws -> String? {
        for key in keys {
            if let value = try? decodeIfPresent(String.self, forKey: key) {
                return value
            }
            if let value = try? decodeIfPresent(Int.self, forKey: key) {
                return String(value)
            }
        }
        return nil
    }
}

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}
