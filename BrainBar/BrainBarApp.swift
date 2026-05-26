import AppKit
import SwiftUI

@main
struct BrainBarApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        MenuBarExtra("BrainBar", systemImage: "brain.head.profile") {
            DashboardView(model: model)
                .frame(width: 860, height: 620)
                .task {
                    await model.refreshStatus()
                }
        }
        .menuBarExtraStyle(.window)

        Window("BrainBar Settings", id: "settings") {
            SettingsView(model: model)
                .frame(width: 640, height: 640)
                .background(WindowFrontAnchor(level: .floating))
        }
        .windowResizability(.contentSize)

        Window("BrainBar Graph", id: "graph-focus") {
            FocusGraphView(model: model)
        }
        .defaultSize(width: 1180, height: 760)
        .windowResizability(.contentMinSize)
    }
}

private struct WindowFrontAnchor: NSViewRepresentable {
    let level: NSWindow.Level

    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        DispatchQueue.main.async {
            raise(view.window)
        }
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        DispatchQueue.main.async {
            raise(nsView.window)
        }
    }

    private func raise(_ window: NSWindow?) {
        guard let window else {
            return
        }
        window.level = level
        window.makeKeyAndOrderFront(nil)
        window.orderFrontRegardless()
        NSApplication.shared.activate(ignoringOtherApps: true)
    }
}
