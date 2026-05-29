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
          width: clamp(300px, 28vw, 380px) !important;
          background: rgba(13, 15, 26, 0.84) !important;
          border-left: 1px solid rgba(255, 255, 255, 0.075) !important;
          box-shadow: -28px 0 74px rgba(0, 0, 0, 0.34) !important;
          backdrop-filter: blur(24px) saturate(1.16);
          -webkit-backdrop-filter: blur(24px) saturate(1.16);
        }

        #search-wrap,
        #info-panel,
        #legend-wrap,
        #stats {
          border-color: rgba(255, 255, 255, 0.075) !important;
        }

        #search-wrap {
          padding: 14px !important;
        }

        #info-panel,
        #legend-wrap {
          padding: 18px 16px !important;
        }

        #legend-wrap {
          min-height: 0 !important;
        }

        #search {
          min-height: 40px !important;
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

        #stats {
          padding: 11px 16px !important;
          background: rgba(8, 10, 18, 0.36) !important;
          color: rgba(244, 246, 255, 0.62) !important;
          font-size: 12px !important;
          font-weight: 650 !important;
          letter-spacing: 0 !important;
        }

        .legend-item,
        .search-item {
          min-height: 25px !important;
          padding: 4px 6px !important;
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

        .vis-tooltip {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }

        #brainbar-graph-tooltip {
          position: fixed;
          z-index: 1000;
          max-width: 260px;
          padding: 7px 9px;
          border: 1px solid rgba(244, 246, 255, 0.12);
          border-radius: 9px;
          background: rgba(10, 12, 21, 0.84);
          color: rgba(244, 246, 255, 0.84);
          font: 650 11px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
          letter-spacing: 0;
          line-height: 1.25;
          box-shadow: 0 16px 46px rgba(0, 0, 0, 0.34);
          backdrop-filter: blur(16px) saturate(1.12);
          -webkit-backdrop-filter: blur(16px) saturate(1.12);
          opacity: 0;
          transform: translate3d(-50%, -4px, 0);
          transition: opacity 120ms ease, transform 120ms ease;
          pointer-events: none;
        }

        #brainbar-graph-tooltip.visible {
          opacity: 1;
          transform: translate3d(-50%, 0, 0);
        }

        #brainbar-graph-tooltip[hidden] {
          display: block !important;
          opacity: 0 !important;
        }

        #brainbar-graph-tooltip .eyebrow {
          display: block;
          margin-bottom: 3px;
          color: rgba(244, 246, 255, 0.46);
          font-size: 9px;
          font-weight: 750;
          letter-spacing: 0.11em;
          text-transform: uppercase;
        }

        #brainbar-graph-tooltip .label {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
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

      const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

      const asLabel = (value) => String(value || '').replace(/\\s+/g, ' ').trim();

      const cleanRelationshipLabel = (value) => {
        const label = asLabel(value)
          .replace(/\\s*\\[[^\\]]*EXTRACTED[^\\]]*\\]\\s*/gi, ' ')
          .replace(/_/g, ' ')
          .replace(/\\s+/g, ' ')
          .trim();
        if (!label || /^contains$/i.test(label)) {
          return '';
        }
        return label.length > 64 ? `${label.slice(0, 61)}...` : label;
      };

      const nodeTooltipLabel = (node) => {
        const label = asLabel(node?.label || node?.title || node?.id);
        return label.length > 72 ? `${label.slice(0, 69)}...` : label;
      };

      const ensurePremiumTooltip = () => {
        let tooltip = document.getElementById('brainbar-graph-tooltip');
        if (!tooltip) {
          tooltip = document.createElement('div');
          tooltip.id = 'brainbar-graph-tooltip';
          tooltip.hidden = true;
          document.body.appendChild(tooltip);
        }
        return tooltip;
      };

      const movePremiumTooltip = (event) => {
        const tooltip = ensurePremiumTooltip();
        const x = event?.clientX ?? event?.pageX ?? 0;
        const y = event?.clientY ?? event?.pageY ?? 0;
        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${Math.max(14, y - 38)}px`;
      };

      const showPremiumTooltip = (eyebrow, label, event) => {
        const cleanLabel = asLabel(label);
        if (!cleanLabel) {
          return;
        }
        const tooltip = ensurePremiumTooltip();
        tooltip.innerHTML = `<span class="eyebrow"></span><span class="label"></span>`;
        tooltip.querySelector('.eyebrow').textContent = eyebrow;
        tooltip.querySelector('.label').textContent = cleanLabel;
        movePremiumTooltip(event);
        tooltip.hidden = false;
        requestAnimationFrame(() => tooltip.classList.add('visible'));
      };

      const hidePremiumTooltip = () => {
        const tooltip = ensurePremiumTooltip();
        tooltip.classList.remove('visible');
        window.clearTimeout(window.__brainBarTooltipHideTimer);
        window.__brainBarTooltipHideTimer = window.setTimeout(() => {
          if (!tooltip.classList.contains('visible')) {
            tooltip.hidden = true;
          }
        }, 140);
      };

      const relationForEdge = (edge, state) => {
        if (!edge) {
          return '';
        }
        const metadata = state ? metadataForEdge(edge, state) : edge;
        return cleanRelationshipLabel(
          metadata?.relation ||
          metadata?.context ||
          metadata?.label ||
          metadata?.title ||
          edge?.relation ||
          edge?.context ||
          edge?.label ||
          edge?.title
        );
      };

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

      const activeNodeIdsFor = (nodeId, edgeId) => {
        const activeNodes = new Set();
        if (nodeId !== undefined && nodeId !== null && typeof network !== 'undefined') {
          activeNodes.add(nodeId);
          network.getConnectedNodes(nodeId).forEach((connected) => activeNodes.add(connected));
        }
        if (edgeId !== undefined && edgeId !== null && typeof edgesDS !== 'undefined') {
          const edge = edgesDS.get(edgeId);
          const source = edgeSource(edge);
          const target = edgeTarget(edge);
          if (source !== undefined && source !== null) {
            activeNodes.add(source);
          }
          if (target !== undefined && target !== null) {
            activeNodes.add(target);
          }
        }
        return activeNodes;
      };

      const activeEdgeIdsFor = (nodeId, edgeId) => {
        const activeEdges = new Set();
        if (nodeId !== undefined && nodeId !== null && typeof network !== 'undefined') {
          network.getConnectedEdges(nodeId).forEach((edge) => activeEdges.add(edge));
        }
        if (edgeId !== undefined && edgeId !== null) {
          activeEdges.add(edgeId);
        }
        return activeEdges;
      };

      const apply2DActiveState = (nodeId, edgeId) => {
        try {
          if (typeof nodesDS === 'undefined' || typeof edgesDS === 'undefined') {
            return;
          }
          const activeNodes = activeNodeIdsFor(nodeId, edgeId);
          const activeEdges = activeEdgeIdsFor(nodeId, edgeId);
          const hasActiveState = activeNodes.size > 0 || activeEdges.size > 0;

          edgesDS.update(edgesDS.get().map((edge) => {
            const isActive = activeEdges.has(edge.id);
            const baseWidth = edge._brainBarBaseWidth || edge.width || 1;
            return {
              id: edge.id,
              color: {
                color: isActive ? 'rgba(218, 228, 255, 0.78)' : 'rgba(132, 148, 178, 0.25)',
                highlight: 'rgba(238, 242, 255, 0.84)',
                hover: 'rgba(218, 228, 255, 0.70)'
              },
              width: isActive ? 1.7 : Math.max(0.75, Math.min(baseWidth, 1.25)),
              selectionWidth: isActive ? 2.2 : 1.5
            };
          }));

          nodesDS.update(nodesDS.get().map((node) => {
            const isActive = activeNodes.has(node.id);
            const current = node.color || {};
            const base = node._brainBarBaseColor || current.background || current.border || '#8fa2ff';
            return {
              id: node.id,
              borderWidth: isActive ? 2 : 0,
              color: {
                background: hasActiveState && !isActive ? 'rgba(142, 156, 188, 0.34)' : base,
                border: isActive ? 'rgba(246, 248, 255, 0.88)' : base,
                hover: {
                  background: base,
                  border: 'rgba(255, 255, 255, 0.86)'
                },
                highlight: {
                  background: isActive ? base : '#f5f7ff',
                  border: 'rgba(246, 248, 255, 0.9)'
                }
              }
            };
          }));

          if (typeof network !== 'undefined') {
            network.redraw();
          }
        } catch (error) {
          console.debug('BrainBar 2D active state skipped', error);
        }
      };

      const installPremium2DInteraction = () => {
        if (window.__brainBarPremium2DInteractionInstalled || typeof network === 'undefined') {
          return;
        }
        window.__brainBarPremium2DInteractionInstalled = true;
        let hoverNode = null;
        let hoverEdge = null;
        let selectedNode = null;

        const applyCurrentInteraction = () => {
          if (selectedNode !== null && selectedNode !== undefined) {
            apply2DActiveState(selectedNode, null);
            return;
          }
          apply2DActiveState(hoverNode, hoverEdge);
        };

        document.addEventListener('mousemove', movePremiumTooltip, { passive: true });

        network.on('hoverNode', (params) => {
          hoverNode = params.node;
          hoverEdge = null;
          const node = typeof nodesDS !== 'undefined' ? nodesDS.get(params.node) : null;
          showPremiumTooltip('Node', nodeTooltipLabel(node), params.event?.srcEvent || params.event);
          if (selectedNode === null || selectedNode === undefined) {
            applyCurrentInteraction();
          }
        });

        network.on('blurNode', () => {
          hoverNode = null;
          hidePremiumTooltip();
          if (selectedNode === null || selectedNode === undefined) {
            applyCurrentInteraction();
          }
        });

        network.on('hoverEdge', (params) => {
          if (selectedNode !== null && selectedNode !== undefined) {
            return;
          }
          hoverEdge = params.edge;
          const edge = typeof edgesDS !== 'undefined' ? edgesDS.get(params.edge) : null;
          const relation = relationForEdge(edge, ensureGraphLensState());
          if (relation) {
            showPremiumTooltip('Relationship', relation, params.event?.srcEvent || params.event);
          }
          applyCurrentInteraction();
        });

        network.on('blurEdge', () => {
          hoverEdge = null;
          hidePremiumTooltip();
          if (selectedNode === null || selectedNode === undefined) {
            applyCurrentInteraction();
          }
        });

        network.on('selectNode', (params) => {
          selectedNode = params.nodes?.[0] ?? null;
          hidePremiumTooltip();
          applyCurrentInteraction();
        });

        network.on('deselectNode', () => {
          selectedNode = null;
          applyCurrentInteraction();
        });

        network.on('dragStart', hidePremiumTooltip);
        network.on('zoom', hidePremiumTooltip);
      };

      const fitPremium2DGraphIfNeeded = () => {
        if (window.__brainBarDidInitialPremium2DFit || typeof network === 'undefined') {
          return;
        }
        window.__brainBarDidInitialPremium2DFit = true;
        window.setTimeout(() => {
          try {
            const nodes = typeof nodesDS !== 'undefined'
              ? nodesDS.get().filter((node) => !node.hidden).map((node) => node.id)
              : [];
            if (nodes.length === 0) {
              return;
            }
            network.fit({
              nodes,
              maxZoomLevel: 1.15,
              animation: { duration: 260, easingFunction: 'easeInOutQuad' }
            });
          } catch (error) {
            console.debug('BrainBar 2D fit skipped', error);
          }
        }, 420);
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
              maxZoomLevel: 1.25,
              animation: { duration: 220, easingFunction: 'easeInOutQuad' }
            });
          }
        }
      };

      const applyNetworkTheme = () => {
        try {
          if (typeof network !== 'undefined') {
            network.setOptions({
              interaction: {
                hover: true,
                tooltipDelay: 120
              },
              nodes: {
                shape: 'dot',
                borderWidth: 0,
                borderWidthSelected: 2,
                shadow: { enabled: false },
                scaling: {
                  min: 5,
                  max: 20,
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
                  color: 'rgba(132, 148, 178, 0.25)',
                  highlight: 'rgba(238, 242, 255, 0.84)',
                  hover: 'rgba(218, 228, 255, 0.70)'
                },
                width: 0.9,
                selectionWidth: 1.8,
                hoverWidth: 1.5,
                smooth: {
                  type: 'dynamic',
                  roundness: 0.18
                },
                arrows: {
                  to: { enabled: false }
                }
              }
            });
          }

          if (typeof nodesDS !== 'undefined') {
            const degreeByNode = new Map();
            if (typeof edgesDS !== 'undefined') {
              edgesDS.get().forEach((edge) => {
                const source = edgeSource(edge);
                const target = edgeTarget(edge);
                if (source !== undefined && source !== null) {
                  degreeByNode.set(source, (degreeByNode.get(source) || 0) + 1);
                }
                if (target !== undefined && target !== null) {
                  degreeByNode.set(target, (degreeByNode.get(target) || 0) + 1);
                }
              });
            }
            const themedNodes = nodesDS.get().map((node) => {
              const color = node.color || {};
              const base = node._brainBarBaseColor || color.background || color.border || '#8fa2ff';
              const degree = degreeByNode.get(node.id) || Number(node.value) || 1;
              return {
                id: node.id,
                title: '',
                _brainBarBaseColor: base,
                borderWidth: 0,
                borderWidthSelected: 2,
                size: clamp(3.8 + Math.sqrt(degree) * 1.1, 4.2, 16),
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
              title: '',
              _brainBarBaseWidth: Math.max(0.75, Math.min(edge._brainBarBaseWidth || edge.width || 1, 1.35)),
              color: {
                color: 'rgba(132, 148, 178, 0.25)',
                highlight: 'rgba(238, 242, 255, 0.84)',
                hover: 'rgba(218, 228, 255, 0.70)'
              },
              width: Math.max(0.75, Math.min(edge._brainBarBaseWidth || edge.width || 1, 1.35)),
              selectionWidth: 1.8,
              hoverWidth: 1.5,
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
        installPremium2DInteraction();
        ensureOpenNoteButton();
        const selectedNodeId = typeof network !== 'undefined' ? network.getSelectedNodes()?.[0] : null;
        if (selectedNodeId) {
          addOpenNoteButton(selectedNodeId);
        }
        window.brainBarApplyGraphLens(window.__brainBarPendingGraphLens || 'all');
        fitPremium2DGraphIfNeeded();
      };

      requestAnimationFrame(applyBrainBarGraphRuntime);
      window.setTimeout(applyBrainBarGraphRuntime, 350);
    })();
    """
}
