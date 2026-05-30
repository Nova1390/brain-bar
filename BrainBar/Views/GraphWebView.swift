import Foundation
import SwiftUI
import WebKit

struct GraphWebView: NSViewRepresentable {
    let fileURL: URL
    let readAccessURL: URL
    let reloadToken: Int
    let sourceLens: GraphSourceLens
    let onOpenNode: @MainActor (GraphNodeOpenRequest) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onOpenNode: onOpenNode)
    }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        for userScript in Self.userScripts() {
            configuration.userContentController.addUserScript(userScript)
        }
        configuration.userContentController.add(context.coordinator, name: "brainBarNodeAction")

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.allowsMagnification = true
        webView.setValue(false, forKey: "drawsBackground")
        webView.navigationDelegate = context.coordinator
        context.coordinator.sourceLens = sourceLens
        context.coordinator.graphMetadataScript = Self.graphMetadataScript(readAccessURL: readAccessURL)
        load(in: webView, context: context)
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        let didLoad = load(in: webView, context: context)
        context.coordinator.onOpenNode = onOpenNode
        context.coordinator.graphMetadataScript = Self.graphMetadataScript(readAccessURL: readAccessURL)
        if didLoad || context.coordinator.sourceLens != sourceLens {
            context.coordinator.sourceLens = sourceLens
            context.coordinator.applyLens(sourceLens, in: webView)
        }
    }

    @discardableResult
    private func load(in webView: WKWebView, context: Context) -> Bool {
        guard context.coordinator.loadedURL != fileURL || context.coordinator.reloadToken != reloadToken else {
            return false
        }
        context.coordinator.loadedURL = fileURL
        context.coordinator.reloadToken = reloadToken
        webView.loadFileURL(fileURL, allowingReadAccessTo: readAccessURL)
        return true
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        var loadedURL: URL?
        var reloadToken = -1
        var sourceLens: GraphSourceLens = .all
        var graphMetadataScript = ""
        var onOpenNode: @MainActor (GraphNodeOpenRequest) -> Void

        init(onOpenNode: @escaping @MainActor (GraphNodeOpenRequest) -> Void) {
            self.onOpenNode = onOpenNode
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            applyLens(sourceLens, in: webView)
        }

        func applyLens(_ lens: GraphSourceLens, in webView: WKWebView) {
            let script = """
            \(graphMetadataScript)
            window.__brainBarPendingGraphLens = "\(lens.rawValue)";
            if (window.brainBarApplyGraphLens) {
              window.brainBarApplyGraphLens("\(lens.rawValue)");
            }
            """
            webView.evaluateJavaScript(script)
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

private extension GraphWebView {
    static func userScripts() -> [WKUserScript] {
        var scripts: [WKUserScript] = []
        if let css = bundledResourceString(name: "brainbar-graph-theme", extension: "css", subdirectory: "Graph2D") {
            scripts.append(
                WKUserScript(
                    source: styleInjectionScript(css: css),
                    injectionTime: .atDocumentEnd,
                    forMainFrameOnly: true
                )
            )
        }
        if let runtime = bundledResourceString(name: "brainbar-graph-runtime", extension: "js", subdirectory: "Graph2D") {
            scripts.append(
                WKUserScript(
                    source: runtime,
                    injectionTime: .atDocumentEnd,
                    forMainFrameOnly: true
                )
            )
        }
        return scripts
    }

    static func graphMetadataScript(readAccessURL: URL) -> String {
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

    static func bundledResourceString(name: String, extension fileExtension: String, subdirectory: String) -> String? {
        guard
            let url = Bundle.main.url(forResource: name, withExtension: fileExtension, subdirectory: subdirectory),
            let contents = try? String(contentsOf: url, encoding: .utf8)
        else {
            assertionFailure("Missing bundled graph resource: \(subdirectory)/\(name).\(fileExtension)")
            return nil
        }
        return contents
    }

    static func styleInjectionScript(css: String) -> String {
        """
        (() => {
          const existing = document.getElementById('brainbar-graph-theme');
          if (existing) {
            existing.remove();
          }
          const style = document.createElement('style');
          style.id = 'brainbar-graph-theme';
          style.textContent = \(jsStringLiteral(css));
          document.head.appendChild(style);
        })();
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
