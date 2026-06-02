import Foundation

struct CommandRunner: Sendable {
    func run(_ spec: CommandSpec, name: String, vaultURL: URL?, timeoutSeconds: Int? = nil) async throws -> CommandResult {
        let startedAt = Date()
        let process = Process()
        let stdout = Pipe()
        let stderr = Pipe()
        let completion = CommandRunCompletion()

        if spec.executable.contains("/") {
            process.executableURL = URL(fileURLWithPath: spec.executable)
            process.arguments = spec.arguments
        } else {
            process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
            process.arguments = [spec.executable] + spec.arguments
        }
        process.environment = mergedEnvironment()

        if let workingDirectory = spec.workingDirectory, !workingDirectory.isEmpty {
            if workingDirectory == "vault" {
                process.currentDirectoryURL = vaultURL
            } else if workingDirectory.hasPrefix("/") {
                process.currentDirectoryURL = URL(fileURLWithPath: workingDirectory)
            }
        }

        process.standardOutput = stdout
        process.standardError = stderr

        return try await withCheckedThrowingContinuation { continuation in
            process.terminationHandler = { process in
                guard completion.markCompleted() else {
                    return
                }
                let outputData = stdout.fileHandleForReading.readDataToEndOfFile()
                let errorData = stderr.fileHandleForReading.readDataToEndOfFile()
                let result = CommandResult(
                    commandName: name,
                    exitCode: process.terminationStatus,
                    stdout: String(data: outputData, encoding: .utf8) ?? "",
                    stderr: String(data: errorData, encoding: .utf8) ?? "",
                    startedAt: startedAt,
                    finishedAt: Date()
                )
                continuation.resume(returning: result)
            }

            do {
                try process.run()
                if let timeoutSeconds, timeoutSeconds > 0 {
                    Task {
                        try? await Task.sleep(for: .seconds(timeoutSeconds))
                        guard !Task.isCancelled, completion.markCompleted() else {
                            return
                        }
                        if process.isRunning {
                            process.terminate()
                        }
                        continuation.resume(throwing: BrainBarError.commandTimedOut(name, timeoutSeconds))
                    }
                }
            } catch {
                guard completion.markCompleted() else {
                    return
                }
                continuation.resume(throwing: BrainBarError.processFailed(error.localizedDescription))
            }
        }
    }

    private func mergedEnvironment() -> [String: String] {
        var environment = ProcessInfo.processInfo.environment
        let localBin = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".local/bin")
            .path
        let fallbackPath = [
            environment["PATH"],
            localBin,
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/usr/bin",
            "/bin",
            "/usr/sbin",
            "/sbin"
        ]
        .compactMap { $0 }
        .joined(separator: ":")
        environment["PATH"] = fallbackPath
        return environment
    }
}

private final class CommandRunCompletion: @unchecked Sendable {
    private let lock = NSLock()
    private var completed = false

    func markCompleted() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard !completed else {
            return false
        }
        completed = true
        return true
    }
}
