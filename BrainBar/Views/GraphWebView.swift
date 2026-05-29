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
        configuration.userContentController.addUserScript(
            WKUserScript(source: Self.graphThemeScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        )
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

    static let graphThemeScript = """
    (() => {
      const existing = document.getElementById('brainbar-graph-theme');
      if (existing) {
        existing.remove();
      }

      const style = document.createElement('style');
      style.id = 'brainbar-graph-theme';
      style.textContent = `
        :root {
          color-scheme: dark;
        }

        html,
        body {
          background: #080a12 !important;
          color: rgba(244, 246, 255, 0.88) !important;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", sans-serif !important;
          letter-spacing: 0 !important;
        }

        #graph {
          background:
            radial-gradient(circle at 38% 34%, rgba(113, 138, 255, 0.105), transparent 31%),
            radial-gradient(circle at 58% 70%, rgba(122, 212, 203, 0.065), transparent 30%),
            #080a12 !important;
        }

        #sidebar {
          width: min(31vw, 340px) !important;
          background: rgba(17, 19, 31, 0.80) !important;
          border-left: 1px solid rgba(255, 255, 255, 0.075) !important;
          box-shadow: -26px 0 70px rgba(0, 0, 0, 0.28) !important;
          backdrop-filter: blur(24px) saturate(1.16);
          -webkit-backdrop-filter: blur(24px) saturate(1.16);
        }

        #search-wrap,
        #info-panel,
        #legend-wrap,
        #stats {
          border-color: rgba(255, 255, 255, 0.075) !important;
        }

        #search {
          min-height: 42px !important;
          padding: 10px 13px !important;
          border: 1px solid rgba(156, 170, 255, 0.24) !important;
          border-radius: 12px !important;
          background: rgba(6, 8, 16, 0.62) !important;
          color: rgba(244, 246, 255, 0.92) !important;
          font-size: 14px !important;
          font-weight: 520 !important;
          outline: none !important;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035) !important;
        }

        #search:focus {
          border-color: rgba(176, 189, 255, 0.48) !important;
          box-shadow:
            0 0 0 3px rgba(126, 150, 255, 0.12),
            inset 0 1px 0 rgba(255, 255, 255, 0.04) !important;
        }

        #info-panel h3,
        #legend-wrap h3 {
          margin-bottom: 14px !important;
          color: rgba(244, 246, 255, 0.54) !important;
          font-size: 11px !important;
          font-weight: 720 !important;
          letter-spacing: 0.13em !important;
        }

        #node-info,
        #legend,
        #stats {
          color: rgba(244, 246, 255, 0.78) !important;
          font-size: 13px !important;
        }

        .legend-item,
        .search-item {
          min-height: 28px !important;
          padding: 5px 7px !important;
          border-radius: 8px !important;
          transition: background 120ms ease, opacity 120ms ease !important;
        }

        .legend-item:hover,
        .search-item:hover {
          background: rgba(255, 255, 255, 0.065) !important;
        }

        .legend-cb,
        #select-all-cb {
          width: 15px !important;
          height: 15px !important;
          border-radius: 5px !important;
          border: 1px solid rgba(244, 246, 255, 0.22) !important;
          background: rgba(244, 246, 255, 0.055) !important;
          box-shadow: none !important;
        }

        .legend-cb:checked,
        #select-all-cb:checked {
          border-color: rgba(135, 161, 255, 0.88) !important;
          background: rgba(126, 154, 255, 0.84) !important;
        }

        .legend-cb:checked::after,
        #select-all-cb:checked::after {
          width: 4px !important;
          height: 8px !important;
          border-width: 0 2px 2px 0 !important;
          left: 4px !important;
          top: 1px !important;
        }

        .color-dot {
          width: 11px !important;
          height: 11px !important;
          box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.055) !important;
        }

        .neighbor-link {
          margin: 4px 0 !important;
          padding: 7px 9px !important;
          border-left-width: 3px !important;
          border-radius: 8px !important;
          background: rgba(255, 255, 255, 0.045) !important;
          color: rgba(244, 246, 255, 0.86) !important;
        }

        .neighbor-link:hover {
          background: rgba(255, 255, 255, 0.075) !important;
        }

        #brainbar-open-note {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 30px;
          margin: 8px 0 2px;
          padding: 6px 10px;
          border: 1px solid rgba(159, 175, 255, 0.24);
          border-radius: 8px;
          background: rgba(132, 152, 255, 0.14);
          color: rgba(244, 246, 255, 0.90);
          font: 650 12px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
          letter-spacing: 0;
          cursor: pointer;
        }

        #brainbar-open-note:hover {
          border-color: rgba(182, 194, 255, 0.38);
          background: rgba(152, 169, 255, 0.20);
        }

        #brainbar-lens-empty {
          position: fixed;
          left: 50%;
          top: 50%;
          z-index: 20;
          transform: translate(-50%, -50%);
          padding: 10px 14px;
          border: 1px solid rgba(244, 246, 255, 0.10);
          border-radius: 999px;
          background: rgba(12, 15, 25, 0.72);
          color: rgba(244, 246, 255, 0.62);
          font-size: 12px;
          font-weight: 650;
          letter-spacing: 0;
          box-shadow: 0 18px 60px rgba(0, 0, 0, 0.25);
          backdrop-filter: blur(18px) saturate(1.12);
          -webkit-backdrop-filter: blur(18px) saturate(1.12);
          pointer-events: none;
        }

        #brainbar-lens-empty[hidden] {
          display: none !important;
        }

        ::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }

        ::-webkit-scrollbar-thumb {
          background: rgba(244, 246, 255, 0.15);
          border: 3px solid transparent;
          border-radius: 999px;
          background-clip: content-box;
        }

        ::-webkit-scrollbar-track {
          background: transparent;
        }
      `;
      document.head.appendChild(style);

      const edgeSource = (edge) => edge.from ?? edge.source;
      const edgeTarget = (edge) => edge.to ?? edge.target;

      const sourceFileForNode = (node) => node?._source_file || node?.source_file || '';

      const sendNodeAction = (action, node) => {
        if (!node || !window.webkit?.messageHandlers?.brainBarNodeAction) {
          return;
        }
        window.webkit.messageHandlers.brainBarNodeAction.postMessage({
          action,
          nodeId: String(node.id || ''),
          label: String(node.label || ''),
          sourceFile: sourceFileForNode(node)
        });
      };

      const ensureOpenNoteButton = () => {
        const info = document.getElementById('info-content');
        if (!info || info.dataset.brainBarOpenNote === 'installed') {
          return;
        }
        info.dataset.brainBarOpenNote = 'installed';
        info.addEventListener('click', (event) => {
          const button = event.target.closest('#brainbar-open-note');
          if (!button) {
            return;
          }
          event.preventDefault();
          const node = nodesDS.get(button.dataset.nodeId);
          sendNodeAction('openNode', node);
        });
      };

      const addOpenNoteButton = (nodeId) => {
        try {
          ensureOpenNoteButton();
          const node = nodesDS.get(nodeId);
          const sourceFile = sourceFileForNode(node);
          const info = document.getElementById('info-content');
          if (!info || !sourceFile || document.getElementById('brainbar-open-note')) {
            return;
          }
          const button = document.createElement('button');
          button.id = 'brainbar-open-note';
          button.type = 'button';
          button.dataset.nodeId = String(nodeId);
          button.textContent = 'Open Note';
          info.insertBefore(button, info.children[1] || null);
        } catch (error) {
          console.debug('BrainBar open note button skipped', error);
        }
      };

      const installNodeActionBridge = () => {
        if (window.__brainBarNodeBridgeInstalled || typeof network === 'undefined') {
          return;
        }
        window.__brainBarNodeBridgeInstalled = true;
        if (typeof showInfo === 'function' && !window.__brainBarShowInfoWrapped) {
          window.__brainBarShowInfoWrapped = true;
          const originalShowInfo = showInfo;
          showInfo = (nodeId) => {
            originalShowInfo(nodeId);
            addOpenNoteButton(nodeId);
          };
        }
        network.on('doubleClick', (params) => {
          const nodeId = params.nodes?.[0];
          if (!nodeId || typeof nodesDS === 'undefined') {
            return;
          }
          sendNodeAction('openNode', nodesDS.get(nodeId));
        });
      };

      const ensureLensEmptyState = () => {
        let overlay = document.getElementById('brainbar-lens-empty');
        if (!overlay) {
          overlay = document.createElement('div');
          overlay.id = 'brainbar-lens-empty';
          overlay.hidden = true;
          document.body.appendChild(overlay);
        }
        return overlay;
      };

      const setLensEmptyMessage = (message) => {
        const overlay = ensureLensEmptyState();
        overlay.textContent = message || '';
        overlay.hidden = !message;
      };

      const rebuildEmptyCommunityLegend = () => {
        try {
          const legend = document.getElementById('legend');
          if (!legend || legend.querySelector('.legend-item')) {
            return;
          }

          const rawNodes = typeof RAW_NODES !== 'undefined'
            ? RAW_NODES
            : (typeof nodesDS !== 'undefined' ? nodesDS.get() : []);
          if (!Array.isArray(rawNodes) || rawNodes.length === 0) {
            return;
          }

          const communities = new Map();
          rawNodes.forEach((node) => {
            const cid = node.community ?? node._community ?? node.community_id;
            if (cid === undefined || cid === null || cid === '') {
              return;
            }
            const key = String(cid);
            const existing = communities.get(key) || {
              cid,
              label: node.community_name || node._community_name || `Community ${key}`,
              color: node.color?.background || node.color?.border || '#8fa2ff',
              count: 0
            };
            existing.count += 1;
            communities.set(key, existing);
          });

          if (communities.size === 0) {
            return;
          }

          const updateFallbackSelectAll = () => {
            const checkbox = document.getElementById('select-all-cb');
            if (!checkbox) {
              return;
            }
            const boxes = Array.from(document.querySelectorAll('.legend-cb'));
            const checked = boxes.filter((box) => box.checked).length;
            checkbox.checked = checked === boxes.length;
            checkbox.indeterminate = checked > 0 && checked < boxes.length;
          };

          const setCommunityVisible = (community, visible, item) => {
            item.classList.toggle('dimmed', !visible);
            if (typeof nodesDS !== 'undefined') {
              const updates = rawNodes
                .filter((node) => String(node.community ?? node._community ?? node.community_id) === String(community.cid))
                .map((node) => ({ id: node.id, hidden: !visible }));
              nodesDS.update(updates);
            }
            updateFallbackSelectAll();
            if (typeof network !== 'undefined') {
              network.redraw();
            }
          };

          const sortedCommunities = Array.from(communities.values())
            .sort((a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label)));

          sortedCommunities.forEach((community) => {
            const item = document.createElement('div');
            item.className = 'legend-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'legend-cb';
            checkbox.checked = true;
            checkbox.addEventListener('change', (event) => {
              event.stopPropagation();
              setCommunityVisible(community, checkbox.checked, item);
            });

            const dot = document.createElement('div');
            dot.className = 'legend-dot';
            dot.style.background = community.color;

            const label = document.createElement('span');
            label.className = 'legend-label';
            label.textContent = community.label;

            const count = document.createElement('span');
            count.className = 'legend-count';
            count.textContent = String(community.count);

            item.append(checkbox, dot, label, count);
            item.addEventListener('click', (event) => {
              if (event.target === checkbox) {
                return;
              }
              checkbox.checked = !checkbox.checked;
              checkbox.dispatchEvent(new Event('change'));
            });
            legend.appendChild(item);
          });

          const selectAll = document.getElementById('select-all-cb');
          if (selectAll && !selectAll.dataset.brainBarFallbackInstalled) {
            selectAll.dataset.brainBarFallbackInstalled = 'true';
            selectAll.addEventListener('change', () => {
              const visible = selectAll.checked;
              document.querySelectorAll('.legend-cb').forEach((checkbox) => {
                checkbox.checked = visible;
              });
              sortedCommunities.forEach((community) => {
                const item = Array.from(document.querySelectorAll('.legend-item'))
                  .find((candidate) => candidate.querySelector('.legend-label')?.textContent === community.label);
                if (item) {
                  setCommunityVisible(community, visible, item);
                }
              });
            });
          }

          updateFallbackSelectAll();
        } catch (error) {
          console.debug('BrainBar community legend fallback skipped', error);
        }
      };

      const ensureGraphLensState = () => {
        try {
          if (typeof nodesDS === 'undefined' || typeof edgesDS === 'undefined') {
            return null;
          }

          const state = window.__brainBarGraphLensState || {};
          if (!state.originalNodes || !state.originalEdges) {
            state.originalNodes = nodesDS.get().map((node) => ({ ...node }));
            state.originalEdges = edgesDS.get().map((edge) => ({ ...edge }));
          }

          const graphVersion = window.__brainBarGraphJSONVersion || 'missing';
          if (state.graphLinksVersion !== graphVersion) {
            const graph = window.__brainBarGraphJSON;
            state.graphLinks = graph ? (graph.links || graph.edges || []) : [];
            state.graphLinksLoaded = true;
            state.graphLinksVersion = graphVersion;
          }

          window.__brainBarGraphLensState = state;
          return state;
        } catch (error) {
          console.debug('BrainBar graph lens state skipped', error);
          return null;
        }
      };

      const metadataForEdge = (edge, state) => {
        const index = Number(edge.id);
        if (Number.isInteger(index)) {
          const graphLink = state.graphLinks?.[index];
          if (graphLink) {
            return graphLink;
          }
          if (typeof RAW_EDGES !== 'undefined' && RAW_EDGES[index]) {
            return RAW_EDGES[index];
          }
        }
        return edge;
      };

      const isObsidianEdge = (edge, state) => {
        const metadata = metadataForEdge(edge, state);
        const values = [
          metadata.context,
          metadata.relation,
          metadata.label,
          metadata.title,
          edge.context,
          edge.relation,
          edge.label,
          edge.title
        ]
          .filter(Boolean)
          .map((value) => String(value).toLowerCase());
        return values.some((value) => value === 'obsidian_wikilink' || value.includes('obsidian_wikilink'));
      };

      window.brainBarApplyGraphLens = (lens) => {
        const state = ensureGraphLensState();
        if (!state) {
          return;
        }

        const selectedLens = lens || 'all';
        window.__brainBarPendingGraphLens = selectedLens;

        const filteredEdges = state.originalEdges.filter((edge) => {
          if (selectedLens === 'all') {
            return true;
          }
          const obsidian = isObsidianEdge(edge, state);
          return selectedLens === 'obsidian' ? obsidian : !obsidian;
        });

        const visibleEdgeIds = new Set(filteredEdges.map((edge) => edge.id));
        const visibleNodeIds = new Set();
        filteredEdges.forEach((edge) => {
          const source = edgeSource(edge);
          const target = edgeTarget(edge);
          if (source !== undefined && source !== null) {
            visibleNodeIds.add(source);
          }
          if (target !== undefined && target !== null) {
            visibleNodeIds.add(target);
          }
        });

        edgesDS.update(state.originalEdges.map((edge) => ({
          id: edge.id,
          hidden: selectedLens !== 'all' && !visibleEdgeIds.has(edge.id)
        })));
        nodesDS.update(state.originalNodes.map((node) => ({
          id: node.id,
          hidden: selectedLens !== 'all' && !visibleNodeIds.has(node.id)
        })));

        if (selectedLens === 'obsidian' && filteredEdges.length === 0) {
          setLensEmptyMessage('No Obsidian links found');
        } else if (selectedLens === 'graphify' && filteredEdges.length === 0) {
          setLensEmptyMessage('No Graphify edges found');
        } else {
          setLensEmptyMessage('');
        }

        if (typeof network !== 'undefined') {
          network.redraw();
          if (selectedLens !== 'all' && visibleNodeIds.size > 0) {
            network.fit({
              nodes: Array.from(visibleNodeIds),
              animation: { duration: 220, easingFunction: 'easeInOutQuad' }
            });
          }
        }
      };

      const applyNetworkTheme = () => {
        try {
          if (typeof network !== 'undefined') {
            network.setOptions({
              nodes: {
                shape: 'dot',
                borderWidth: 0,
                borderWidthSelected: 3,
                shadow: { enabled: false },
                scaling: {
                  min: 6,
                  max: 24,
                  label: { enabled: false }
                },
                font: {
                  face: '-apple-system, BlinkMacSystemFont, SF Pro Text, Inter, Segoe UI, sans-serif',
                  color: 'rgba(244, 246, 255, 0.82)',
                  strokeWidth: 0
                }
              },
              edges: {
                color: {
                  color: 'rgba(145, 158, 181, 0.23)',
                  highlight: 'rgba(210, 219, 255, 0.74)',
                  hover: 'rgba(210, 219, 255, 0.56)'
                },
                width: 1,
                selectionWidth: 2,
                smooth: {
                  type: 'dynamic',
                  roundness: 0.16
                },
                arrows: {
                  to: { enabled: false }
                }
              }
            });
          }

          if (typeof nodesDS !== 'undefined') {
            const themedNodes = nodesDS.get().map((node) => {
              const color = node.color || {};
              const base = color.background || color.border || '#8fa2ff';
              return {
                id: node.id,
                borderWidth: 0,
                borderWidthSelected: 3,
                color: {
                  background: base,
                  border: base,
                  hover: {
                    background: base,
                    border: 'rgba(255, 255, 255, 0.82)'
                  },
                  highlight: {
                    background: '#f5f7ff',
                    border: base
                  }
                },
                font: {
                  ...(node.font || {}),
                  face: '-apple-system, BlinkMacSystemFont, SF Pro Text, Inter, Segoe UI, sans-serif',
                  color: 'rgba(244, 246, 255, 0.82)',
                  strokeWidth: 0
                }
              };
            });
            nodesDS.update(themedNodes);
          }

          if (typeof edgesDS !== 'undefined') {
            const themedEdges = edgesDS.get().map((edge) => ({
              id: edge.id,
              color: {
                color: 'rgba(145, 158, 181, 0.23)',
                highlight: 'rgba(210, 219, 255, 0.74)',
                hover: 'rgba(210, 219, 255, 0.56)'
              },
              width: Math.max(0.7, Math.min(edge.width || 1, 1.6)),
              arrows: { to: { enabled: false } }
            }));
            edgesDS.update(themedEdges);
          }

          if (typeof network !== 'undefined') {
            network.redraw();
          }
        } catch (error) {
          console.debug('BrainBar graph theme skipped', error);
        }
      };

      const applyBrainBarGraphRuntime = () => {
        applyNetworkTheme();
        rebuildEmptyCommunityLegend();
        installNodeActionBridge();
        ensureOpenNoteButton();
        const selectedNodeId = typeof network !== 'undefined' ? network.getSelectedNodes()?.[0] : null;
        if (selectedNodeId) {
          addOpenNoteButton(selectedNodeId);
        }
        window.brainBarApplyGraphLens(window.__brainBarPendingGraphLens || 'all');
      };

      requestAnimationFrame(applyBrainBarGraphRuntime);
      window.setTimeout(applyBrainBarGraphRuntime, 350);
    })();
    """
}
