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
                .background(WindowFrontAnchor(level: .normal))
        }
        .windowResizability(.contentSize)

        Window("BrainBar Graph", id: "graph-focus") {
            FocusGraphView(model: model)
        }
        .defaultSize(width: 1180, height: 760)
        .windowResizability(.contentMinSize)
    }
}

enum BrainBarWindowController {
    static func bringSettingsToFront() {
        bringWindowToFront(title: "BrainBar Settings", level: .normal)
    }

    static func bringFocusGraphToFront() {
        bringWindowToFront(title: "BrainBar Graph", level: .normal)
    }

    private static func bringWindowToFront(title: String, level: NSWindow.Level) {
        bringWindowToFront(title: title, level: level, attemptsRemaining: 6)
    }

    private static func bringWindowToFront(title: String, level: NSWindow.Level, attemptsRemaining: Int) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
            guard let window = NSApplication.shared.windows.first(where: { $0.title == title }) else {
                if attemptsRemaining > 0 {
                    bringWindowToFront(title: title, level: level, attemptsRemaining: attemptsRemaining - 1)
                }
                return
            }
            window.level = level
            window.makeKeyAndOrderFront(nil)
            window.orderFrontRegardless()
            NSApplication.shared.activate(ignoringOtherApps: true)
        }
    }

    static func dismissMenuBarWindow() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
            NSApplication.shared.windows
                .filter { $0.title.isEmpty }
                .forEach { $0.orderOut(nil) }
        }
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
