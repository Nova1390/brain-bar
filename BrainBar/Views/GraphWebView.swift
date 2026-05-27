import SwiftUI
import WebKit

struct GraphWebView: NSViewRepresentable {
    let fileURL: URL
    let readAccessURL: URL
    let reloadToken: Int
    let sourceLens: GraphSourceLens

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.addUserScript(
            WKUserScript(source: Self.graphThemeScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        )
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.allowsMagnification = true
        webView.setValue(false, forKey: "drawsBackground")
        webView.navigationDelegate = context.coordinator
        context.coordinator.sourceLens = sourceLens
        load(in: webView, context: context)
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        let didLoad = load(in: webView, context: context)
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

    final class Coordinator: NSObject, WKNavigationDelegate {
        var loadedURL: URL?
        var reloadToken = -1
        var sourceLens: GraphSourceLens = .all

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            applyLens(sourceLens, in: webView)
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
    }
}

private extension GraphWebView {
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

          if (!state.graphLinksLoading && !state.graphLinksLoaded) {
            state.graphLinksLoading = true;
            fetch('graph.json')
              .then((response) => response.ok ? response.json() : null)
              .then((graph) => {
                state.graphLinks = graph ? (graph.links || graph.edges || []) : [];
                state.graphLinksLoaded = true;
                state.graphLinksLoading = false;
                window.__brainBarGraphLensState = state;
                window.brainBarApplyGraphLens(window.__brainBarPendingGraphLens || 'all');
              })
              .catch(() => {
                state.graphLinks = [];
                state.graphLinksLoaded = true;
                state.graphLinksLoading = false;
                window.__brainBarGraphLensState = state;
              });
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
        window.brainBarApplyGraphLens(window.__brainBarPendingGraphLens || 'all');
      };

      requestAnimationFrame(applyBrainBarGraphRuntime);
      window.setTimeout(applyBrainBarGraphRuntime, 350);
    })();
    """
}
