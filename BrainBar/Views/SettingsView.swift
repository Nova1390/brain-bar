import AppKit
import SwiftUI

struct SettingsView: View {
    let model: AppModel
    @State private var draft: SettingsDraft
    @State private var saveMessage: String?
    @State private var saveSucceeded = false
    @State private var isSavingAndCheckingReviewQueue = false

    init(model: AppModel) {
        self.model = model
        _draft = State(initialValue: SettingsDraft(config: model.config))
    }

    var body: some View {
        Form {
            Section("Vault") {
                HStack {
                    TextField("Vault path", text: $draft.vaultPath)
                    Button {
                        chooseVault()
                    } label: {
                        Image(systemName: "folder")
                    }
                    .help("Choose vault folder")
                }
                Text("Config: \(model.configPath)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
                Text("BrainBar stays local-first: this path is saved only in your local config.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Graph") {
                TextField("Project dashboard", text: $draft.projectDashboardRelativePath)
                TextField("Graph HTML", text: $draft.graphHtmlRelativePath)
                TextField("Graphify report", text: $draft.graphReportRelativePath)
                TextField("Refresh executable", text: $draft.refreshExecutable)
                TextField("Refresh arguments", text: $draft.refreshArguments)
                Text("Graph paths are relative to the vault. The default refresh command is graphify update .")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Brain Check") {
                TextField("Brain check executable", text: $draft.brainCheckExecutable)
                    .help("Optional. Leave empty to disable Brain Check.")
                TextField("Brain check arguments", text: $draft.brainCheckArguments)
                    .help("Runs inside the configured vault. Example: scripts/brain_check.py --strict")
                Text("Optional local hook. Example: executable python3, arguments scripts/brain_check.py --strict.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("Leave the executable empty to show Configure Brain Check instead of a runnable check.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Review Queue") {
                Toggle("Enable Review Queue", isOn: $draft.reviewQueueEnabled)
                TextField("Status command executable", text: $draft.reviewQueuePreflightExecutable)
                    .help("Optional preflight command. It must print JSON and should not modify files.")
                    .disabled(!draft.reviewQueueEnabled)
                TextField("Status command arguments", text: $draft.reviewQueuePreflightArguments)
                    .disabled(!draft.reviewQueueEnabled)
                Text("BrainBar only reads JSON status. Put private or mutating logic in your own script.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("Status command must print compact JSON, for example: {\"pending_count\":2,\"items\":[\"Draft\"]}. For real workflows, prefer a small script such as python3 scripts/review_queue_status.py.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                HStack {
                    Button("Use Demo Status") {
                        draft.reviewQueueEnabled = true
                        draft.reviewQueuePreflightExecutable = "/bin/echo"
                        draft.reviewQueuePreflightArguments = "{\"pending_count\":2,\"items\":[\"First item\",\"Second item\"]}"
                        draft.reviewQueueBackgroundWatcherEnabled = false
                    }
                    .controlSize(.small)
                    .help("Fills a status-only demo command. It does not configure a manual action.")

                    Spacer()

                    Button(isSavingAndCheckingReviewQueue ? "Checking..." : "Save & Check") {
                        saveAndCheckReviewQueue()
                    }
                    .controlSize(.small)
                    .disabled(!draft.canRunReviewQueueStatus || isSavingAndCheckingReviewQueue)
                }

                TextField("Manual action command executable", text: $draft.reviewQueueManualExecutable)
                    .help("Optional action. BrainBar only runs this when you click Run Action.")
                    .disabled(!draft.reviewQueueEnabled)
                TextField("Manual action command arguments", text: $draft.reviewQueueManualArguments)
                    .disabled(!draft.reviewQueueEnabled)

                Toggle("Background watcher", isOn: $draft.reviewQueueBackgroundWatcherEnabled)
                    .disabled(!draft.canEnableReviewQueueWatcher)
                Stepper(value: $draft.reviewQueueWatcherIntervalSeconds, in: 300...3_600, step: 300) {
                    TextField("Watcher interval seconds", value: $draft.reviewQueueWatcherIntervalSeconds, format: .number)
                }
                .disabled(!draft.reviewQueueBackgroundWatcherEnabled || !draft.reviewQueueEnabled)
                Stepper(value: $draft.reviewQueueTimeoutSeconds, in: 1...60) {
                    TextField("Command timeout seconds", value: $draft.reviewQueueTimeoutSeconds, format: .number)
                }
                .disabled(!draft.reviewQueueEnabled)
                Text("The watcher is off by default and only runs the status command. Manual action commands never run automatically.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Advanced") {
                Stepper(value: $draft.serverPort, in: 1...65_535) {
                    TextField("Local server port", value: $draft.serverPort, format: .number)
                }
                Toggle("Use Obsidian URL scheme", isOn: $draft.useObsidianURLScheme)
                Toggle("Notifications", isOn: $draft.notificationsEnabled)
                Text("The local server is a fallback/debug option. The main graph view loads the HTML directly inside BrainBar.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            HStack {
                Button("Reload") {
                    draft = SettingsDraft(config: model.config)
                    saveMessage = nil
                }
                Spacer()
                if let saveMessage {
                    SettingsSaveStatus(message: saveMessage, succeeded: saveSucceeded)
                }
                Button("Save") {
                    saveDraft()
                }
                .keyboardShortcut(.defaultAction)
            }

            SettingsFooter()
        }
        .formStyle(.grouped)
        .padding()
    }

    private func chooseVault() {
        NSApplication.shared.activate(ignoringOtherApps: true)
        BrainBarWindowController.bringSettingsToFront()
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.level = .floating

        if let settingsWindow = BrainBarWindowController.settingsWindow() {
            panel.beginSheetModal(for: settingsWindow) { response in
                guard response == .OK, let url = panel.url else {
                    return
                }
                draft.vaultPath = url.path
            }
        } else if panel.runModal() == .OK, let url = panel.url {
            draft.vaultPath = url.path
        }
    }

    private func clearSaveMessageAfterDelay() {
        Task {
            try? await Task.sleep(for: .seconds(2))
            saveMessage = nil
        }
    }

    @discardableResult
    private func saveDraft() -> Bool {
        saveSucceeded = model.saveConfig(draft.config)
        saveMessage = saveSucceeded ? "Saved" : "Save failed"
        clearSaveMessageAfterDelay()
        return saveSucceeded
    }

    private func saveAndCheckReviewQueue() {
        guard saveDraft() else {
            return
        }
        isSavingAndCheckingReviewQueue = true
        Task {
            await model.refreshReviewQueueStatus()
            isSavingAndCheckingReviewQueue = false
        }
    }
}

private struct SettingsFooter: View {
    private let repositoryURL = URL(string: "https://github.com/Nova1390/brain-bar")!
    private let releaseURL = URL(string: "https://github.com/Nova1390/brain-bar/releases/latest")!
    private let licenseURL = URL(string: "https://github.com/Nova1390/brain-bar/blob/main/LICENSE")!

    var body: some View {
        Section {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                    Link(destination: releaseURL) {
                        Label("Release \(versionText)", systemImage: "tag")
                    }

                    Link(destination: repositoryURL) {
                        Label {
                            Text("Nova1390/brain-bar")
                        } icon: {
                            Image("GitHubMark")
                                .resizable()
                                .renderingMode(.template)
                                .frame(width: 13, height: 13)
                        }
                    }
                }

                HStack(spacing: 4) {
                    Text("Copyright © 2026 Rocco D'Affuso ·")
                    Link("MIT License", destination: licenseURL)
                }
                .foregroundStyle(.secondary)
            }
            .font(.caption)
            .buttonStyle(.link)
        }
    }

    private var versionText: String {
        let dictionary = Bundle.main.infoDictionary
        let version = dictionary?["CFBundleShortVersionString"] as? String ?? "dev"
        guard let build = dictionary?["CFBundleVersion"] as? String, !build.isEmpty else {
            return version
        }
        return "\(version) (\(build))"
    }
}

private struct SettingsSaveStatus: View {
    let message: String
    let succeeded: Bool

    var body: some View {
        Label(message, systemImage: succeeded ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
            .font(.caption.weight(.medium))
            .foregroundStyle(succeeded ? .green : .red)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background((succeeded ? Color.green : Color.red).opacity(0.10), in: Capsule())
    }
}

private struct SettingsDraft: Equatable {
    var vaultPath: String
    var projectDashboardRelativePath: String
    var graphHtmlRelativePath: String
    var graphReportRelativePath: String
    var serverPort: Int
    var useObsidianURLScheme: Bool
    var notificationsEnabled: Bool
    var refreshExecutable: String
    var refreshArguments: String
    var brainCheckExecutable: String
    var brainCheckArguments: String
    var reviewQueueEnabled: Bool
    var reviewQueuePreflightExecutable: String
    var reviewQueuePreflightArguments: String
    var reviewQueueManualExecutable: String
    var reviewQueueManualArguments: String
    var reviewQueueBackgroundWatcherEnabled: Bool
    var reviewQueueWatcherIntervalSeconds: Int
    var reviewQueueTimeoutSeconds: Int

    init(config: BrainBarConfig) {
        vaultPath = config.vaultPath
        projectDashboardRelativePath = config.projectDashboardRelativePath
        graphHtmlRelativePath = config.graphHtmlRelativePath
        graphReportRelativePath = config.graphReportRelativePath
        serverPort = config.serverPort
        useObsidianURLScheme = config.useObsidianURLScheme
        notificationsEnabled = config.notificationsEnabled
        refreshExecutable = config.commands.refreshGraph.executable
        refreshArguments = config.commands.refreshGraph.arguments.joined(separator: " ")
        brainCheckExecutable = config.commands.brainCheck?.executable ?? ""
        brainCheckArguments = config.commands.brainCheck?.arguments.joined(separator: " ") ?? ""
        let reviewQueue = config.reviewQueue.normalized
        reviewQueueEnabled = reviewQueue.isEnabled
        reviewQueuePreflightExecutable = reviewQueue.preflightCommand?.executable ?? ""
        reviewQueuePreflightArguments = reviewQueue.preflightCommand?.arguments.joined(separator: " ") ?? ""
        reviewQueueManualExecutable = reviewQueue.manualCommand?.executable ?? ""
        reviewQueueManualArguments = reviewQueue.manualCommand?.arguments.joined(separator: " ") ?? ""
        reviewQueueBackgroundWatcherEnabled = reviewQueue.backgroundWatcherEnabled
        reviewQueueWatcherIntervalSeconds = reviewQueue.watcherIntervalSeconds
        reviewQueueTimeoutSeconds = reviewQueue.timeoutSeconds
    }

    var config: BrainBarConfig {
        BrainBarConfig(
            vaultPath: vaultPath,
            projectDashboardRelativePath: projectDashboardRelativePath,
            graphHtmlRelativePath: graphHtmlRelativePath,
            graphReportRelativePath: graphReportRelativePath,
            serverPort: serverPort,
            useObsidianURLScheme: useObsidianURLScheme,
            notificationsEnabled: notificationsEnabled,
            commands: CommandConfiguration(
                refreshGraph: CommandSpec(
                    executable: refreshExecutable.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "graphify" : refreshExecutable,
                    arguments: splitArguments(refreshArguments),
                    workingDirectory: "vault"
                ),
                brainCheck: brainCheckExecutable.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : CommandSpec(
                    executable: brainCheckExecutable,
                    arguments: splitArguments(brainCheckArguments),
                    workingDirectory: "vault"
                )
            ),
            reviewQueue: ReviewQueueConfiguration(
                isEnabled: reviewQueueEnabled,
                preflightCommand: commandSpec(
                    executable: reviewQueuePreflightExecutable,
                    arguments: reviewQueuePreflightArguments
                ),
                manualCommand: commandSpec(
                    executable: reviewQueueManualExecutable,
                    arguments: reviewQueueManualArguments
                ),
                backgroundWatcherEnabled: reviewQueueBackgroundWatcherEnabled,
                watcherIntervalSeconds: reviewQueueWatcherIntervalSeconds,
                timeoutSeconds: reviewQueueTimeoutSeconds
            ).normalized
        ).normalized()
    }

    var canEnableReviewQueueWatcher: Bool {
        reviewQueueEnabled && !reviewQueuePreflightExecutable.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var canRunReviewQueueStatus: Bool {
        reviewQueueEnabled && !reviewQueuePreflightExecutable.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func splitArguments(_ text: String) -> [String] {
        text.split(separator: " ").map(String.init)
    }

    private func commandSpec(executable: String, arguments: String) -> CommandSpec? {
        let trimmedExecutable = executable.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedExecutable.isEmpty else {
            return nil
        }
        return CommandSpec(
            executable: trimmedExecutable,
            arguments: splitArguments(arguments),
            workingDirectory: "vault"
        )
    }
}
