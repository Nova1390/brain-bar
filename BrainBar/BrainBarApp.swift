import SwiftUI

@main
struct BrainBarApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        MenuBarExtra("BrainBar", systemImage: "brain.head.profile") {
            DashboardView(model: model)
                .frame(width: 410)
                .task {
                    await model.refreshStatus()
                }
        }
        .menuBarExtraStyle(.window)

        Settings {
            SettingsView(model: model)
                .frame(width: 520)
        }
    }
}
