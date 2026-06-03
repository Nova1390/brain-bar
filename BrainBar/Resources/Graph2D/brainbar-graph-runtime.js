(function makeBrainBarGraph2DRuntime(root, factory) {
  const api = factory(root);
  root.BrainBarGraph2DRuntime = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildBrainBarGraph2DRuntime(root) {
  'use strict';

  const GRAPHIFY_LENS = 'graphify';
  const OBSIDIAN_LENS = 'obsidian';
  const ALL_LENS = 'all';

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const idKey = (value) => String(value);
  const edgeSource = (edge) => edge?.from ?? edge?.source;
  const edgeTarget = (edge) => edge?.to ?? edge?.target;
  const asLabel = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const sourceFileForNode = (node) => node?._source_file || node?.source_file || '';

  function stableHash(value) {
    const input = String(value || '');
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function parseHexColor(value) {
    const color = String(value || '').trim();
    const match = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!match) {
      return null;
    }

    const hex = match[1].length === 3
      ? match[1].split('').map((part) => part + part).join('')
      : match[1];

    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  }

  function atlasColor(value, alpha, mix = 0.28) {
    const rgb = parseHexColor(value);
    if (!rgb) {
      return value || `rgba(143, 162, 255, ${alpha})`;
    }

    const base = { r: 132, g: 150, b: 184 };
    const r = Math.round(rgb.r * (1 - mix) + base.r * mix);
    const g = Math.round(rgb.g * (1 - mix) + base.g * mix);
    const b = Math.round(rgb.b * (1 - mix) + base.b * mix);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function organicEdgeSmooth(edge) {
    const hash = stableHash(`${edge?.id}:${edgeSource(edge)}:${edgeTarget(edge)}`);
    return {
      enabled: true,
      type: hash % 2 === 0 ? 'curvedCW' : 'curvedCCW',
      roundness: 0.035 + ((hash % 70) / 1000)
    };
  }

  function cleanRelationshipLabel(value) {
    const label = asLabel(value)
      .replace(/\s*\[[^\]]*EXTRACTED[^\]]*\]\s*/gi, ' ')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!label || /^contains$/i.test(label)) {
      return '';
    }
    return label.length > 64 ? `${label.slice(0, 61)}...` : label;
  }

  function nodeTooltipLabel(node) {
    const label = asLabel(node?.label || node?.title || node?.id);
    return label.length > 72 ? `${label.slice(0, 69)}...` : label;
  }

  function normalizeLens(lens) {
    return lens === GRAPHIFY_LENS || lens === OBSIDIAN_LENS ? lens : ALL_LENS;
  }

  function rawEdges() {
    return typeof RAW_EDGES !== 'undefined' ? RAW_EDGES : root.RAW_EDGES;
  }

  function rawNodes() {
    return typeof RAW_NODES !== 'undefined' ? RAW_NODES : root.RAW_NODES;
  }

  function graphNetwork() {
    return typeof network !== 'undefined' ? network : root.network;
  }

  function graphNodesDS() {
    return typeof nodesDS !== 'undefined' ? nodesDS : root.nodesDS;
  }

  function graphEdgesDS() {
    return typeof edgesDS !== 'undefined' ? edgesDS : root.edgesDS;
  }

  function metadataForEdge(edge, state) {
    const index = Number(edge?.id);
    if (Number.isInteger(index)) {
      const graphLink = state?.graphLinks?.[index];
      if (graphLink) {
        return graphLink;
      }
      const edges = rawEdges();
      if (edges && edges[index]) {
        return edges[index];
      }
    }
    return edge || {};
  }

  function isObsidianEdge(edge, state) {
    const metadata = metadataForEdge(edge, state);
    const values = [
      metadata.context,
      metadata.relation,
      metadata.label,
      metadata.title,
      edge?.context,
      edge?.relation,
      edge?.label,
      edge?.title
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());
    return values.some((value) => value === 'obsidian_wikilink' || value.includes('obsidian_wikilink'));
  }

  function nodeActionPayload(action, node) {
    return {
      action,
      nodeId: String(node?.id || ''),
      label: String(node?.label || ''),
      sourceFile: sourceFileForNode(node)
    };
  }

  function hiddenMap(items) {
    const map = new Map();
    (items || []).forEach((item) => {
      map.set(idKey(item.id), Boolean(item.hidden));
    });
    return map;
  }

  function computeLensDiff(options) {
    const selectedLens = normalizeLens(options?.lens);
    const originalNodes = options?.originalNodes || [];
    const originalEdges = options?.originalEdges || [];
    const currentNodes = options?.currentNodes || originalNodes;
    const currentEdges = options?.currentEdges || originalEdges;
    const state = { graphLinks: options?.graphLinks || [] };

    const filteredEdges = originalEdges.filter((edge) => {
      if (selectedLens === ALL_LENS) {
        return true;
      }
      const obsidian = isObsidianEdge(edge, state);
      return selectedLens === OBSIDIAN_LENS ? obsidian : !obsidian;
    });

    const visibleEdgeIds = new Set(filteredEdges.map((edge) => idKey(edge.id)));
    const visibleNodeIds = new Set();
    filteredEdges.forEach((edge) => {
      const source = edgeSource(edge);
      const target = edgeTarget(edge);
      if (source !== undefined && source !== null) {
        visibleNodeIds.add(idKey(source));
      }
      if (target !== undefined && target !== null) {
        visibleNodeIds.add(idKey(target));
      }
    });

    const currentEdgeHidden = hiddenMap(currentEdges);
    const currentNodeHidden = hiddenMap(currentNodes);
    const edgeUpdates = [];
    const nodeUpdates = [];

    originalEdges.forEach((edge) => {
      const desiredHidden = selectedLens !== ALL_LENS && !visibleEdgeIds.has(idKey(edge.id));
      if ((currentEdgeHidden.get(idKey(edge.id)) || false) !== desiredHidden) {
        edgeUpdates.push({ id: edge.id, hidden: desiredHidden });
      }
    });

    originalNodes.forEach((node) => {
      const desiredHidden = selectedLens !== ALL_LENS && !visibleNodeIds.has(idKey(node.id));
      if ((currentNodeHidden.get(idKey(node.id)) || false) !== desiredHidden) {
        nodeUpdates.push({ id: node.id, hidden: desiredHidden });
      }
    });

    let emptyMessage = '';
    if (selectedLens === OBSIDIAN_LENS && filteredEdges.length === 0) {
      emptyMessage = 'No wikilinks found';
    } else if (selectedLens === GRAPHIFY_LENS && filteredEdges.length === 0) {
      emptyMessage = 'No Graphify edges found';
    }

    return {
      lens: selectedLens,
      edgeUpdates,
      nodeUpdates,
      filteredEdgeCount: filteredEdges.length,
      visibleNodeIds: Array.from(visibleNodeIds),
      emptyMessage
    };
  }

  function relationForEdge(edge, state) {
    if (!edge) {
      return '';
    }
    const metadata = metadataForEdge(edge, state);
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
  }

  function ensurePremiumTooltip(document) {
    let tooltip = document.getElementById('brainbar-graph-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'brainbar-graph-tooltip';
      tooltip.hidden = true;
      document.body.appendChild(tooltip);
    }
    return tooltip;
  }

  function installBrowserRuntime() {
    if (!root.document) {
      return;
    }

    function ensureGraphLensState() {
      try {
        const nodesDataSet = graphNodesDS();
        const edgesDataSet = graphEdgesDS();
        if (!nodesDataSet || !edgesDataSet) {
          return null;
        }

        const state = root.__brainBarGraphLensState || {};
        const graphVersion = root.__brainBarGraphJSONVersion || 'missing';
        const nodeCount = nodesDataSet.get().length;
        const edgeCount = edgesDataSet.get().length;
        const snapshotVersion = `${graphVersion}:${nodeCount}:${edgeCount}`;

        if (state.snapshotVersion !== snapshotVersion) {
          state.originalNodes = nodesDataSet.get().map((node) => ({ ...node }));
          state.originalEdges = edgesDataSet.get().map((edge) => ({ ...edge }));
          state.snapshotVersion = snapshotVersion;
          state.themeAppliedVersion = '';
        }

        if (state.graphLinksVersion !== graphVersion) {
          const graph = root.__brainBarGraphJSON;
          state.graphLinks = graph ? (graph.links || graph.edges || []) : [];
          state.graphLinksVersion = graphVersion;
        }

        root.__brainBarGraphLensState = state;
        return state;
      } catch (error) {
        console.debug('BrainBar graph lens state skipped', error);
        return null;
      }
    }

    function movePremiumTooltip(event) {
      const tooltip = ensurePremiumTooltip(root.document);
      const x = event?.clientX ?? event?.pageX ?? 0;
      const y = event?.clientY ?? event?.pageY ?? 0;
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${Math.max(14, y - 38)}px`;
    }

    function showPremiumTooltip(eyebrow, label, event) {
      const cleanLabel = asLabel(label);
      if (!cleanLabel) {
        return;
      }
      const tooltip = ensurePremiumTooltip(root.document);
      tooltip.innerHTML = '<span class="eyebrow"></span><span class="label"></span>';
      tooltip.querySelector('.eyebrow').textContent = eyebrow;
      tooltip.querySelector('.label').textContent = cleanLabel;
      movePremiumTooltip(event);
      tooltip.hidden = false;
      root.requestAnimationFrame(() => tooltip.classList.add('visible'));
    }

    function hidePremiumTooltip() {
      const tooltip = ensurePremiumTooltip(root.document);
      tooltip.classList.remove('visible');
      root.clearTimeout(root.__brainBarTooltipHideTimer);
      root.__brainBarTooltipHideTimer = root.setTimeout(() => {
        if (!tooltip.classList.contains('visible')) {
          tooltip.hidden = true;
        }
      }, 140);
    }

    function sendNodeAction(action, node) {
      if (!node || !root.webkit?.messageHandlers?.brainBarNodeAction) {
        return;
      }
      root.webkit.messageHandlers.brainBarNodeAction.postMessage(nodeActionPayload(action, node));
    }

    function ensureOpenNoteButton() {
      const info = root.document.getElementById('info-content');
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
        const node = graphNodesDS()?.get(button.dataset.nodeId);
        sendNodeAction('openNode', node);
      });
    }

    function addOpenNoteButton(nodeId) {
      try {
        ensureOpenNoteButton();
        const node = graphNodesDS()?.get(nodeId);
        const sourceFile = sourceFileForNode(node);
        const info = root.document.getElementById('info-content');
        if (!info || !sourceFile || root.document.getElementById('brainbar-open-note')) {
          return;
        }
        const button = root.document.createElement('button');
        button.id = 'brainbar-open-note';
        button.type = 'button';
        button.dataset.nodeId = String(nodeId);
        button.textContent = 'Open Note';
        info.insertBefore(button, info.children[1] || null);
      } catch (error) {
        console.debug('BrainBar open note button skipped', error);
      }
    }

    function installNodeActionBridge() {
      const currentNetwork = graphNetwork();
      if (root.__brainBarNodeBridgeInstalled || !currentNetwork) {
        return;
      }
      root.__brainBarNodeBridgeInstalled = true;
      if (typeof showInfo === 'function' && !root.__brainBarShowInfoWrapped) {
        root.__brainBarShowInfoWrapped = true;
        const originalShowInfo = showInfo;
        showInfo = (nodeId) => {
          originalShowInfo(nodeId);
          addOpenNoteButton(nodeId);
        };
      }
      currentNetwork.on('doubleClick', (params) => {
        const nodeId = params.nodes?.[0];
        const nodesDataSet = graphNodesDS();
        if (!nodeId || !nodesDataSet) {
          return;
        }
        sendNodeAction('openNode', nodesDataSet.get(nodeId));
      });
    }

    function ensureLensEmptyState() {
      let overlay = root.document.getElementById('brainbar-lens-empty');
      if (!overlay) {
        overlay = root.document.createElement('div');
        overlay.id = 'brainbar-lens-empty';
        overlay.hidden = true;
        root.document.body.appendChild(overlay);
      }
      return overlay;
    }

    function setLensEmptyMessage(message) {
      const overlay = ensureLensEmptyState();
      overlay.textContent = message || '';
      overlay.hidden = !message;
    }

    function rebuildEmptyCommunityLegend() {
      try {
        const legend = root.document.getElementById('legend');
        if (!legend || legend.querySelector('.legend-item')) {
          return;
        }

        const nodesDataSet = graphNodesDS();
        const nodes = Array.isArray(rawNodes())
          ? rawNodes()
          : (nodesDataSet ? nodesDataSet.get() : []);
        if (!Array.isArray(nodes) || nodes.length === 0) {
          return;
        }

        const communities = new Map();
        nodes.forEach((node) => {
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
          const checkbox = root.document.getElementById('select-all-cb');
          if (!checkbox) {
            return;
          }
          const boxes = Array.from(root.document.querySelectorAll('.legend-cb'));
          const checked = boxes.filter((box) => box.checked).length;
          checkbox.checked = checked === boxes.length;
          checkbox.indeterminate = checked > 0 && checked < boxes.length;
        };

        const setCommunityVisible = (community, visible, item) => {
          item.classList.toggle('dimmed', !visible);
          const dataSet = graphNodesDS();
          if (dataSet) {
            const updates = nodes
              .filter((node) => String(node.community ?? node._community ?? node.community_id) === String(community.cid))
              .map((node) => ({ id: node.id, hidden: !visible }));
            dataSet.update(updates);
          }
          updateFallbackSelectAll();
          const currentNetwork = graphNetwork();
          if (currentNetwork) {
            currentNetwork.redraw();
          }
        };

        const sortedCommunities = Array.from(communities.values())
          .sort((a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label)));

        sortedCommunities.forEach((community) => {
          const item = root.document.createElement('div');
          item.className = 'legend-item';

          const checkbox = root.document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.className = 'legend-cb';
          checkbox.checked = true;
          checkbox.addEventListener('change', (event) => {
            event.stopPropagation();
            setCommunityVisible(community, checkbox.checked, item);
          });

          const dot = root.document.createElement('div');
          dot.className = 'legend-dot';
          dot.style.background = community.color;

          const label = root.document.createElement('span');
          label.className = 'legend-label';
          label.textContent = community.label;

          const count = root.document.createElement('span');
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

        const selectAll = root.document.getElementById('select-all-cb');
        if (selectAll && !selectAll.dataset.brainBarFallbackInstalled) {
          selectAll.dataset.brainBarFallbackInstalled = 'true';
          selectAll.addEventListener('change', () => {
            const visible = selectAll.checked;
            root.document.querySelectorAll('.legend-cb').forEach((checkbox) => {
              checkbox.checked = visible;
            });
            sortedCommunities.forEach((community) => {
              const item = Array.from(root.document.querySelectorAll('.legend-item'))
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
    }

    function installPremium2DInteraction() {
      const currentNetwork = graphNetwork();
      if (root.__brainBarPremium2DInteractionInstalled || !currentNetwork) {
        return;
      }
      root.__brainBarPremium2DInteractionInstalled = true;

      root.document.addEventListener('mousemove', movePremiumTooltip, { passive: true });

      currentNetwork.on('hoverNode', (params) => {
        const node = graphNodesDS()?.get(params.node) || null;
        showPremiumTooltip('Node', nodeTooltipLabel(node), params.event?.srcEvent || params.event);
      });

      currentNetwork.on('blurNode', hidePremiumTooltip);

      currentNetwork.on('hoverEdge', (params) => {
        const edge = graphEdgesDS()?.get(params.edge) || null;
        const relation = relationForEdge(edge, ensureGraphLensState());
        if (relation) {
          showPremiumTooltip('Relationship', relation, params.event?.srcEvent || params.event);
        }
      });

      currentNetwork.on('blurEdge', hidePremiumTooltip);
      currentNetwork.on('selectNode', (params) => {
        hidePremiumTooltip();
        const selectedNodeId = params.nodes?.[0];
        if (selectedNodeId) {
          addOpenNoteButton(selectedNodeId);
        }
      });
      currentNetwork.on('deselectNode', hidePremiumTooltip);
      currentNetwork.on('dragStart', hidePremiumTooltip);
      currentNetwork.on('zoom', hidePremiumTooltip);
    }

    function applyNetworkTheme() {
      try {
        const currentNetwork = graphNetwork();
        const nodesDataSet = graphNodesDS();
        const edgesDataSet = graphEdgesDS();

        if (currentNetwork) {
          currentNetwork.setOptions({
            interaction: {
              hover: true,
              hoverConnectedEdges: true,
              selectConnectedEdges: true,
              tooltipDelay: 120
            },
            nodes: {
              shape: 'dot',
              borderWidth: 1.15,
              borderWidthSelected: 2,
              shadow: {
                enabled: true,
                color: 'rgba(126, 154, 255, 0.16)',
                size: 5,
                x: 0,
                y: 0
              },
              scaling: {
                min: 6,
                max: 22,
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
                enabled: true,
                type: 'continuous',
                roundness: 0.12
              },
              arrows: {
                to: { enabled: false }
              }
            }
          });
        }

        const state = ensureGraphLensState();
        if (!state || !nodesDataSet || !edgesDataSet || state.themeAppliedVersion === state.snapshotVersion) {
          return;
        }

        const degreeByNode = new Map();
        edgesDataSet.get().forEach((edge) => {
          const source = edgeSource(edge);
          const target = edgeTarget(edge);
          if (source !== undefined && source !== null) {
            degreeByNode.set(idKey(source), (degreeByNode.get(idKey(source)) || 0) + 1);
          }
          if (target !== undefined && target !== null) {
            degreeByNode.set(idKey(target), (degreeByNode.get(idKey(target)) || 0) + 1);
          }
        });

        const themedNodes = nodesDataSet.get().map((node) => {
          const color = node.color || {};
          const base = node._brainBarBaseColor || color.background || color.border || '#8fa2ff';
          const degree = degreeByNode.get(idKey(node.id)) || Number(node.value) || 1;
          const isLeaf = degree <= 1;
          const isSmall = degree <= 3;
          const size = isLeaf
            ? 4.2
            : clamp(4.2 + Math.sqrt(degree) * 1.12, 5.2, 17);
          return {
            id: node.id,
            title: '',
            _brainBarBaseColor: base,
            borderWidth: isLeaf ? 0.55 : clamp(0.75 + Math.log1p(degree) * 0.08, 0.82, 1.45),
            borderWidthSelected: 2,
            size,
            color: {
              background: isLeaf ? atlasColor(base, 0.16, 0.52) : atlasColor(base, isSmall ? 0.20 : 0.28, 0.38),
              border: atlasColor(base, isLeaf ? 0.44 : 0.72, isLeaf ? 0.54 : 0.32),
              hover: {
                background: atlasColor(base, 0.86, 0.12),
                border: 'rgba(248, 250, 255, 0.92)'
              },
              highlight: {
                background: atlasColor(base, 0.90, 0.10),
                border: 'rgba(248, 250, 255, 0.96)'
              }
            },
            shadow: {
              enabled: degree > 10,
              color: 'rgba(126, 154, 255, 0.18)',
              size: clamp(Math.sqrt(degree) * 1.2, 3, 9),
              x: 0,
              y: 0
            },
            font: {
              ...(node.font || {}),
              face: '-apple-system, BlinkMacSystemFont, SF Pro Text, Inter, Segoe UI, sans-serif',
              color: 'rgba(244, 246, 255, 0.82)',
              strokeWidth: 0
            }
          };
        });
        nodesDataSet.update(themedNodes);

        const themedEdges = edgesDataSet.get().map((edge) => {
          const baseWidth = Math.max(0.7, Math.min(edge._brainBarBaseWidth || edge.width || 1, 1.2));
          const smooth = organicEdgeSmooth(edge);
          return {
            id: edge.id,
            title: '',
            _brainBarBaseWidth: baseWidth,
            color: {
              color: 'rgba(126, 146, 184, 0.30)',
              highlight: 'rgba(238, 244, 255, 0.92)',
              hover: 'rgba(218, 232, 255, 0.82)'
            },
            width: baseWidth,
            selectionWidth: 2.05,
            hoverWidth: 1.85,
            smooth,
            arrows: { to: { enabled: false } }
          };
        });
        edgesDataSet.update(themedEdges);
        state.themeAppliedVersion = state.snapshotVersion;

        if (currentNetwork) {
          currentNetwork.redraw();
        }
      } catch (error) {
        console.debug('BrainBar graph theme skipped', error);
      }
    }

    root.brainBarApplyGraphLens = (lens) => {
      applyNetworkTheme();
      rebuildEmptyCommunityLegend();
      installNodeActionBridge();
      installPremium2DInteraction();
      ensureOpenNoteButton();

      const state = ensureGraphLensState();
      if (!state) {
        return;
      }

      const selectedLens = normalizeLens(lens || root.__brainBarPendingGraphLens || ALL_LENS);
      root.__brainBarPendingGraphLens = selectedLens;
      const nodesDataSet = graphNodesDS();
      const edgesDataSet = graphEdgesDS();
      if (!nodesDataSet || !edgesDataSet) {
        return;
      }

      const diff = computeLensDiff({
        lens: selectedLens,
        originalNodes: state.originalNodes,
        originalEdges: state.originalEdges,
        graphLinks: state.graphLinks,
        currentNodes: nodesDataSet.get(),
        currentEdges: edgesDataSet.get()
      });

      if (diff.edgeUpdates.length > 0) {
        edgesDataSet.update(diff.edgeUpdates);
      }
      if (diff.nodeUpdates.length > 0) {
        nodesDataSet.update(diff.nodeUpdates);
      }
      setLensEmptyMessage(diff.emptyMessage);

      const currentNetwork = graphNetwork();
      if (currentNetwork) {
        currentNetwork.redraw();
      }
    };

    function applyBrainBarGraphRuntime() {
      applyNetworkTheme();
      rebuildEmptyCommunityLegend();
      installNodeActionBridge();
      installPremium2DInteraction();
      ensureOpenNoteButton();
      const currentNetwork = graphNetwork();
      const selectedNodeId = currentNetwork ? currentNetwork.getSelectedNodes()?.[0] : null;
      if (selectedNodeId) {
        addOpenNoteButton(selectedNodeId);
      }
      root.brainBarApplyGraphLens(root.__brainBarPendingGraphLens || ALL_LENS);
    }

    if (!root.__brainBarGraph2DRuntimeInstalled) {
      root.__brainBarGraph2DRuntimeInstalled = true;
      root.requestAnimationFrame(applyBrainBarGraphRuntime);
      root.setTimeout(applyBrainBarGraphRuntime, 350);
    } else {
      applyBrainBarGraphRuntime();
    }
  }

  const api = {
    allLens: ALL_LENS,
    graphifyLens: GRAPHIFY_LENS,
    obsidianLens: OBSIDIAN_LENS,
    cleanRelationshipLabel,
    computeLensDiff,
    edgeSource,
    edgeTarget,
    isObsidianEdge,
    metadataForEdge,
    nodeActionPayload,
    nodeTooltipLabel,
    normalizeLens,
    sourceFileForNode
  };

  installBrowserRuntime();
  return api;
});
