import Foundation
import SwiftUI
import WebKit

struct GraphWebView: NSViewRepresentable {
    let fileURL: URL
    let readAccessURL: URL
    let reloadToken: Int
    let sourceLens: GraphSourceLens
    let reviewQueueStatus: ReviewQueueStatus
    let viewportCommand: GraphViewportCommand?
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
        context.coordinator.reviewQueueScript = Self.reviewQueueTargetsScript(status: reviewQueueStatus)
        context.coordinator.graphMetadataScript = Self.graphMetadataScript(readAccessURL: readAccessURL)
        load(in: webView, context: context)
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        let didLoad = load(in: webView, context: context)
        context.coordinator.onOpenNode = onOpenNode
        let graphMetadataScript = Self.graphMetadataScript(readAccessURL: readAccessURL)
        let didUpdateGraphMetadata = context.coordinator.graphMetadataScript != graphMetadataScript
        context.coordinator.graphMetadataScript = graphMetadataScript
        let reviewQueueScript = Self.reviewQueueTargetsScript(status: reviewQueueStatus)
        if context.coordinator.reviewQueueScript != reviewQueueScript {
            context.coordinator.reviewQueueScript = reviewQueueScript
            context.coordinator.applyReviewQueueTargets(in: webView)
        }
        context.coordinator.applyViewportCommandIfNeeded(viewportCommand, in: webView)
        if didLoad || didUpdateGraphMetadata || context.coordinator.sourceLens != sourceLens {
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
        var reviewQueueScript = ""
        var lastViewportCommandID = -1
        var onOpenNode: @MainActor (GraphNodeOpenRequest) -> Void

        init(onOpenNode: @escaping @MainActor (GraphNodeOpenRequest) -> Void) {
            self.onOpenNode = onOpenNode
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            applyReviewQueueTargets(in: webView)
            applyLens(sourceLens, in: webView)
        }

        func applyReviewQueueTargets(in webView: WKWebView) {
            let script = """
            \(reviewQueueScript)
            if (window.brainBarApplyReviewQueueTargets) {
              window.brainBarApplyReviewQueueTargets(window.__brainBarReviewQueueTargets || []);
            }
            """
            webView.evaluateJavaScript(script)
        }

        func applyViewportCommandIfNeeded(_ command: GraphViewportCommand?, in webView: WKWebView) {
            guard let command, lastViewportCommandID != command.id else {
                return
            }
            lastViewportCommandID = command.id
            let script: String
            switch command.kind {
            case .fit:
                script = "if (window.network && window.network.fit) { window.network.fit({ animation: { duration: 240, easingFunction: 'easeInOutQuad' } }); }"
            case .zoomIn:
                script = "if (window.network && window.network.moveTo) { const scale = window.network.getScale ? window.network.getScale() : 1; window.network.moveTo({ scale: scale * 1.18 }); }"
            case .zoomOut:
                script = "if (window.network && window.network.moveTo) { const scale = window.network.getScale ? window.network.getScale() : 1; window.network.moveTo({ scale: scale * 0.8474576271 }); }"
            case .topView, .resetTilt:
                script = ""
            case .graphHealth:
                script = "if (window.brainBarShowGraphHealth) { window.brainBarShowGraphHealth(); }"
            }
            guard !script.isEmpty else {
                return
            }
            webView.evaluateJavaScript(script)
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
        window.__brainBarNodeFileMetadata = \(nodeFileMetadataJSON(graphObject: object, readAccessURL: readAccessURL));
        """
    }

    static func nodeFileMetadataJSON(graphObject: Any, readAccessURL: URL) -> String {
        guard
            let graph = graphObject as? [String: Any],
            let nodes = graph["nodes"] as? [[String: Any]]
        else {
            return "{ \"byNodeId\": {}, \"bySourceFile\": {} }"
        }

        let vaultURL = readAccessURL.deletingLastPathComponent().standardizedFileURL
        var byNodeId: [String: [String: Any]] = [:]
        var bySourceFile: [String: [String: Any]] = [:]

        for node in nodes {
            guard
                let idValue = node["id"],
                let sourceFile = (node["source_file"] as? String) ?? (node["_source_file"] as? String),
                !sourceFile.isEmpty,
                let fileURL = resolvedVaultFileURL(sourceFile, vaultURL: vaultURL)
            else {
                continue
            }

            let resourceValues = try? fileURL.resourceValues(forKeys: [.contentModificationDateKey])
            guard let modifiedAt = resourceValues?.contentModificationDate?.timeIntervalSince1970 else {
                continue
            }

            let entry: [String: Any] = [
                "source_file": sourceFile,
                "mtime": modifiedAt
            ]
            byNodeId[String(describing: idValue)] = entry
            bySourceFile[sourceFile] = entry
        }

        let payload: [String: Any] = [
            "byNodeId": byNodeId,
            "bySourceFile": bySourceFile
        ]
        guard
            let data = try? JSONSerialization.data(withJSONObject: payload),
            let json = String(data: data, encoding: .utf8)
        else {
            return "{ \"byNodeId\": {}, \"bySourceFile\": {} }"
        }
        return json
    }

    static func resolvedVaultFileURL(_ sourceFile: String, vaultURL: URL) -> URL? {
        guard
            !sourceFile.hasPrefix("/"),
            !sourceFile.split(separator: "/").contains(where: { $0 == ".." })
        else {
            return nil
        }
        let resolved = vaultURL.appendingPathComponent(sourceFile).standardizedFileURL
        guard resolved.path.hasPrefix(vaultURL.path + "/") || resolved.path == vaultURL.path else {
            return nil
        }
        return resolved
    }

    static func reviewQueueTargetsScript(status: ReviewQueueStatus) -> String {
        let targets = status.items.compactMap { item -> [String: String]? in
            var target: [String: String] = [:]
            if let nodeId = item.nodeId, !nodeId.isEmpty {
                target["node_id"] = nodeId
            }
            if let sourceFile = item.sourceFile, !sourceFile.isEmpty {
                target["source_file"] = sourceFile
            }
            guard !target.isEmpty else {
                return nil
            }
            target["title"] = item.title
            return target
        }

        guard
            let data = try? JSONSerialization.data(withJSONObject: targets),
            let json = String(data: data, encoding: .utf8)
        else {
            return "window.__brainBarReviewQueueTargets = [];"
        }

        return "window.__brainBarReviewQueueTargets = \(json);"
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
