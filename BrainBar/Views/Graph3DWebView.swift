import AppKit
import Foundation
import SwiftUI
import WebKit

struct Graph3DWebView: NSViewRepresentable {
    let readAccessURL: URL
    let reloadToken: Int
    let sourceLens: GraphSourceLens
    let resetCameraToken: Int
    let viewportCommand: GraphViewportCommand?
    let onDiagnostic: @MainActor (String) -> Void
    let onOpenNode: @MainActor (GraphNodeOpenRequest) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onDiagnostic: onDiagnostic, onOpenNode: onOpenNode)
    }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.setURLSchemeHandler(context.coordinator, forURLScheme: "brainbar3d")
        configuration.userContentController.add(context.coordinator, name: "brainBarNodeAction")
        configuration.userContentController.add(context.coordinator, name: "brainBarGraphDiagnostic")

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.allowsMagnification = true
        webView.wantsLayer = true
        webView.layer?.backgroundColor = NSColor(red: 0.02, green: 0.025, blue: 0.04, alpha: 1).cgColor
        webView.setValue(true, forKey: "drawsBackground")
        webView.navigationDelegate = context.coordinator

        context.coordinator.sourceLens = sourceLens
        context.coordinator.resetCameraToken = resetCameraToken
        context.coordinator.graphJSONURL = readAccessURL.appendingPathComponent("graph.json")
        context.coordinator.graphPayloadScript = Self.graphPayloadScript(readAccessURL: readAccessURL)
        load(in: webView, context: context)
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        let didLoad = load(in: webView, context: context)
        context.coordinator.onOpenNode = onOpenNode
        context.coordinator.onDiagnostic = onDiagnostic
        context.coordinator.graphJSONURL = readAccessURL.appendingPathComponent("graph.json")
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

        context.coordinator.applyViewportCommandIfNeeded(viewportCommand, in: webView)
    }

    @discardableResult
    private func load(in webView: WKWebView, context: Context) -> Bool {
        guard context.coordinator.reloadToken != reloadToken else {
            return false
        }
        context.coordinator.reloadToken = reloadToken

        guard let indexURL = URL(string: "brainbar3d://resources/index.html") else {
            webView.loadHTMLString("<html><body style='background:#080a12;color:white'>3D graph resources unavailable.</body></html>", baseURL: nil)
            return true
        }

        context.coordinator.indexURL = indexURL
        webView.load(URLRequest(url: indexURL))
        return true
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler, WKURLSchemeHandler {
        var indexURL: URL?
        var reloadToken = -1
        var sourceLens: GraphSourceLens = .all
        var resetCameraToken = 0
        var lastViewportCommandID: Int?
        var graphJSONURL: URL?
        var graphPayloadScript = ""
        var onDiagnostic: @MainActor (String) -> Void
        var onOpenNode: @MainActor (GraphNodeOpenRequest) -> Void

        init(
            onDiagnostic: @escaping @MainActor (String) -> Void,
            onOpenNode: @escaping @MainActor (GraphNodeOpenRequest) -> Void
        ) {
            self.onDiagnostic = onDiagnostic
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
            evaluate(script, in: webView)
        }

        func applyLens(_ lens: GraphSourceLens, in webView: WKWebView) {
            let script = """
            window.__brainBarPendingGraphLens = "\(lens.rawValue)";
            if (window.brainBarApplyGraphLens) {
              window.brainBarApplyGraphLens("\(lens.rawValue)");
            }
            """
            evaluate(script, in: webView)
        }

        func resetCamera(in webView: WKWebView) {
            evaluate("if (window.brainBarResetCamera) { window.brainBarResetCamera(); }", in: webView)
        }

        func applyViewportCommandIfNeeded(_ command: GraphViewportCommand?, in webView: WKWebView) {
            guard let command, lastViewportCommandID != command.id else {
                return
            }
            lastViewportCommandID = command.id
            let script: String
            switch command.kind {
            case .fit:
                script = "if (window.brainBarResetCamera) { window.brainBarResetCamera(); }"
            case .zoomIn:
                script = "if (window.brainBarZoom) { window.brainBarZoom(1.18); }"
            case .zoomOut:
                script = "if (window.brainBarZoom) { window.brainBarZoom(0.8474576271); }"
            case .topView:
                script = "if (window.brainBarTopView) { window.brainBarTopView(); }"
            case .resetTilt:
                script = "if (window.brainBarResetTilt) { window.brainBarResetTilt(); }"
            case .graphHealth:
                script = "if (window.brainBarShowGraphHealth) { window.brainBarShowGraphHealth(); }"
            }
            evaluate(script, in: webView)
        }

        func evaluate(_ script: String, in webView: WKWebView) {
            webView.evaluateJavaScript(script) { [weak self] _, error in
                guard let self, let error else {
                    return
                }
                Task { @MainActor in
                    self.onDiagnostic(error.localizedDescription)
                }
            }
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any] else {
                return
            }

            if message.name == "brainBarGraphDiagnostic" {
                let diagnostic = String(describing: body["message"] ?? body["error"] ?? "")
                Task { @MainActor in
                    onDiagnostic(diagnostic)
                }
                return
            }

            guard message.name == "brainBarNodeAction" else {
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

        func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
            guard let fileURL = bundleURL(for: urlSchemeTask.request.url) else {
                urlSchemeTask.didFailWithError(BrainBarError.fileMissing("3D graph resource"))
                return
            }

            do {
                let data = try Data(contentsOf: fileURL)
                let response = URLResponse(
                    url: urlSchemeTask.request.url ?? fileURL,
                    mimeType: mimeType(for: fileURL.pathExtension),
                    expectedContentLength: data.count,
                    textEncodingName: fileURL.pathExtension == "html" ? "utf-8" : nil
                )
                urlSchemeTask.didReceive(response)
                urlSchemeTask.didReceive(data)
                urlSchemeTask.didFinish()
            } catch {
                urlSchemeTask.didFailWithError(error)
            }
        }

        func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

        private func bundleURL(for url: URL?) -> URL? {
            guard let url else {
                return nil
            }
            let rawPath = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            let relativePath = rawPath.isEmpty ? "index.html" : rawPath
            if relativePath == "graph.json" {
                return graphJSONURL
            }
            return Bundle.main.resourceURL?
                .appendingPathComponent("Graph3D", isDirectory: true)
                .appendingPathComponent(relativePath)
        }

        private func mimeType(for pathExtension: String) -> String {
            switch pathExtension.lowercased() {
            case "html":
                return "text/html"
            case "css":
                return "text/css"
            case "js", "mjs":
                return "text/javascript"
            case "json":
                return "application/json"
            case "txt":
                return "text/plain"
            default:
                return "application/octet-stream"
            }
        }
    }
}

extension Graph3DWebView {
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
            window.__brainBarNodeFileMetadata = { byNodeId: {}, bySourceFile: {} };
            """
        }

        let resourceValues = try? graphJSONURL.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey])
        let modifiedAt = resourceValues?.contentModificationDate?.timeIntervalSince1970 ?? 0
        let fileSize = resourceValues?.fileSize ?? data.count
        let version = "\(graphJSONURL.path):\(modifiedAt):\(fileSize)"

        return """
        window.__brainBarGraphJSONVersion = \(jsStringLiteral(version));
        window.__brainBarGraphJSON = \(json);
        window.__brainBarNodeFileMetadata = \(GraphNodeFileMetadata.json(graphObject: object, readAccessURL: readAccessURL));
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
