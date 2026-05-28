import AppKit
import SwiftUI

struct SettingsView: View {
    let model: AppModel
    @State private var draft: SettingsDraft
    @State private var saveMessage: String?
    @State private var saveSucceeded = false

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
                    saveSucceeded = model.saveConfig(draft.config)
                    saveMessage = saveSucceeded ? "Saved" : "Save failed"
                    clearSaveMessageAfterDelay()
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
        panel.level = .modalPanel
        if panel.runModal() == .OK, let url = panel.url {
            draft.vaultPath = url.path
        }
    }

    private func clearSaveMessageAfterDelay() {
        Task {
            try? await Task.sleep(for: .seconds(2))
            saveMessage = nil
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
            )
        )
    }

    private func splitArguments(_ text: String) -> [String] {
        text.split(separator: " ").map(String.init)
    }
}
