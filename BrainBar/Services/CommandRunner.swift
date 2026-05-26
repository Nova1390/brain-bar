import Foundation

struct CommandRunner: Sendable {
    func run(_ spec: CommandSpec, name: String, vaultURL: URL?) async throws -> CommandResult {
        let startedAt = Date()
        let process = Process()
        let stdout = Pipe()
        let stderr = Pipe()

        if spec.executable.contains("/") {
            process.executableURL = URL(fileURLWithPath: spec.executable)
            process.arguments = spec.arguments
        } else {
            process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
            process.arguments = [spec.executable] + spec.arguments
        }

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
            } catch {
                continuation.resume(throwing: BrainBarError.processFailed(error.localizedDescription))
            }
        }
    }
}
