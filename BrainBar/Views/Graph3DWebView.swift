import Foundation
import SwiftUI
import WebKit

struct Graph3DWebView: NSViewRepresentable {
    let readAccessURL: URL
    let reloadToken: Int
    let sourceLens: GraphSourceLens
    let resetCameraToken: Int
    let onOpenNode: @MainActor (GraphNodeOpenRequest) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onOpenNode: onOpenNode)
    }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(context.coordinator, name: "brainBarNodeAction")

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.allowsMagnification = true
        webView.setValue(false, forKey: "drawsBackground")
        webView.navigationDelegate = context.coordinator

        context.coordinator.sourceLens = sourceLens
        context.coordinator.resetCameraToken = resetCameraToken
        context.coordinator.graphPayloadScript = Self.graphPayloadScript(readAccessURL: readAccessURL)
        load(in: webView, context: context)
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        let didLoad = load(in: webView, context: context)
        context.coordinator.onOpenNode = onOpenNode
        context.coordinator.graphPayloadScript = Self.graphPayloadScript(readAccessURL: readAccessURL)

        if didLoad {
            return
        }

        if context.coordinator.sourceLens != sourceLens {
            context.coordinator.sourceLens = sourceLens
            context.coordinator.applyLens(sourceLens, in: webView)
        }

        if context.coordinator.resetCameraToken != resetCameraToken {
            context.coordinator.resetCameraToken = resetCameraToken
            context.coordinator.resetCamera(in: webView)
        }
    }

    @discardableResult
    private func load(in webView: WKWebView, context: Context) -> Bool {
        guard context.coordinator.reloadToken != reloadToken else {
            return false
        }
        context.coordinator.reloadToken = reloadToken

        guard let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Graph3D") else {
            webView.loadHTMLString("<html><body style='background:#080a12;color:white'>3D graph resources unavailable.</body></html>", baseURL: nil)
            return true
        }

        context.coordinator.indexURL = indexURL
        webView.loadFileURL(indexURL, allowingReadAccessTo: indexURL.deletingLastPathComponent())
        return true
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        var indexURL: URL?
        var reloadToken = -1
        var sourceLens: GraphSourceLens = .all
        var resetCameraToken = 0
        var graphPayloadScript = ""
        var onOpenNode: @MainActor (GraphNodeOpenRequest) -> Void

        init(onOpenNode: @escaping @MainActor (GraphNodeOpenRequest) -> Void) {
            self.onOpenNode = onOpenNode
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            loadGraph(sourceLens, in: webView)
        }

        func loadGraph(_ lens: GraphSourceLens, in webView: WKWebView) {
            let script = """
            \(graphPayloadScript)
            window.__brainBarPendingGraphLens = "\(lens.rawValue)";
            if (window.brainBarLoadGraph) {
              window.brainBarLoadGraph(window.__brainBarGraphJSON, "\(lens.rawValue)");
            }
            """
            webView.evaluateJavaScript(script)
        }

        func applyLens(_ lens: GraphSourceLens, in webView: WKWebView) {
            let script = """
            window.__brainBarPendingGraphLens = "\(lens.rawValue)";
            if (window.brainBarApplyGraphLens) {
              window.brainBarApplyGraphLens("\(lens.rawValue)");
            }
            """
            webView.evaluateJavaScript(script)
        }

        func resetCamera(in webView: WKWebView) {
            webView.evaluateJavaScript("if (window.brainBarResetCamera) { window.brainBarResetCamera(); }")
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard
                message.name == "brainBarNodeAction",
                let body = message.body as? [String: Any]
            else {
                return
            }

            let request = GraphNodeOpenRequest(
                action: String(describing: body["action"] ?? ""),
                nodeId: String(describing: body["nodeId"] ?? ""),
                label: String(describing: body["label"] ?? ""),
                sourceFile: body["sourceFile"] as? String
            )
            Task { @MainActor in
                onOpenNode(request)
            }
        }
    }
}

private extension Graph3DWebView {
    static func graphPayloadScript(readAccessURL: URL) -> String {
        let graphJSONURL = readAccessURL.appendingPathComponent("graph.json")
        guard
            let data = try? Data(contentsOf: graphJSONURL),
            let object = try? JSONSerialization.jsonObject(with: data),
            let normalizedData = try? JSONSerialization.data(withJSONObject: object),
            let json = String(data: normalizedData, encoding: .utf8)
        else {
            return """
            window.__brainBarGraphJSONVersion = "missing";
            window.__brainBarGraphJSON = null;
            """
        }

        let resourceValues = try? graphJSONURL.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey])
        let modifiedAt = resourceValues?.contentModificationDate?.timeIntervalSince1970 ?? 0
        let fileSize = resourceValues?.fileSize ?? data.count
        let version = "\(graphJSONURL.path):\(modifiedAt):\(fileSize)"

        return """
        window.__brainBarGraphJSONVersion = \(jsStringLiteral(version));
        window.__brainBarGraphJSON = \(json);
        """
    }

    static func jsStringLiteral(_ value: String) -> String {
        guard
            let data = try? JSONSerialization.data(withJSONObject: [value]),
            let arrayLiteral = String(data: data, encoding: .utf8),
            arrayLiteral.hasPrefix("["),
            arrayLiteral.hasSuffix("]")
        else {
            return "\"\""
        }
        return String(arrayLiteral.dropFirst().dropLast())
    }
}
