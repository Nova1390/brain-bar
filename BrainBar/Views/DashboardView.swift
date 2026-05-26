import SwiftUI

struct DashboardView: View {
    let model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            header
            statusPanel
            actionGrid
            serverRow
            footer
        }
        .padding(16)
    }

    private var header: some View {
        HStack {
            Label("BrainBar", systemImage: "brain.head.profile")
                .font(.headline)
            Spacer()
            SettingsLink {
                Image(systemName: "gearshape")
            }
            .buttonStyle(.borderless)
            .help("Settings")
            Button {
                Task {
                    await model.refreshStatus()
                }
            } label: {
                Image(systemName: "arrow.clockwise")
            }
            .buttonStyle(.borderless)
            .help("Refresh status")
        }
    }

    private var statusPanel: some View {
        VStack(alignment: .leading, spacing: 8) {
            StatusRow(label: "Vault", value: model.status.vaultPath.isEmpty ? "Not configured" : model.status.vaultPath)
            StatusRow(label: "Git", value: model.status.gitDescription)
            StatusRow(label: "Brain check", value: model.lastBrainCheck?.summary ?? "Not run")
            StatusRow(label: "Graphify", value: model.lastGraphRefresh?.summary ?? "Not run")
            StatusRow(label: "Graph server", value: model.graphServerRunning ? (model.graphServerURL?.absoluteString ?? "Running") : "Stopped")
        }
    }

    private var actionGrid: some View {
        Grid(alignment: .leading, horizontalSpacing: 10, verticalSpacing: 10) {
            GridRow {
                ActionButton(title: "Open Vault", systemImage: "folder", action: model.openVault)
                ActionButton(title: "Open Dashboard", systemImage: "doc.text", action: model.openProjectDashboard)
            }
            GridRow {
                ActionButton(title: "Open Graph", systemImage: "point.3.connected.trianglepath.dotted", action: model.openGraph)
                ActionButton(title: "Open Report", systemImage: "doc.richtext", action: model.openGraphifyReport)
            }
            GridRow {
                AsyncActionButton(
                    title: model.isRefreshingGraph ? "Refreshing..." : "Refresh Graph",
                    systemImage: "arrow.triangle.2.circlepath",
                    isDisabled: model.isRefreshingGraph
                ) {
                    await model.refreshGraph()
                }
                AsyncActionButton(
                    title: "Refresh + Open",
                    systemImage: "arrow.up.forward.app",
                    isDisabled: model.isRefreshingGraph
                ) {
                    await model.refreshGraph(openAfterSuccess: true)
                }
            }
            GridRow {
                AsyncActionButton(
                    title: model.isRunningBrainCheck ? "Checking..." : "Run Brain Check",
                    systemImage: "checkmark.seal",
                    isDisabled: model.isRunningBrainCheck
                ) {
                    await model.runBrainCheck()
                }
                Color.clear
                    .gridCellUnsizedAxes([.horizontal, .vertical])
            }
        }
    }

    private var serverRow: some View {
        HStack {
            AsyncActionButton(
                title: model.graphServerRunning ? "Stop Graph Server" : "Start Graph Server",
                systemImage: model.graphServerRunning ? "stop.circle" : "play.circle"
            ) {
                await model.startOrStopGraphServer()
            }
            if let url = model.graphServerURL {
                Text(url.absoluteString)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
        }
    }

    @ViewBuilder
    private var footer: some View {
        if let error = model.errorMessage, !error.isEmpty {
            Text(error)
                .font(.caption)
                .foregroundStyle(.red)
                .textSelection(.enabled)
        }
    }
}

private struct StatusRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(width: 78, alignment: .leading)
            Text(value)
                .font(.caption)
                .lineLimit(2)
                .textSelection(.enabled)
            Spacer(minLength: 0)
        }
    }
}

private struct ActionButton: View {
    let title: String
    let systemImage: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
    }
}

private struct AsyncActionButton: View {
    let title: String
    let systemImage: String
    var isDisabled = false
    let action: () async -> Void

    var body: some View {
        Button {
            Task {
                await action()
            }
        } label: {
            Label(title, systemImage: systemImage)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
        .disabled(isDisabled)
    }
}

#Preview {
    DashboardView(model: AppModel())
        .frame(width: 410)
}
