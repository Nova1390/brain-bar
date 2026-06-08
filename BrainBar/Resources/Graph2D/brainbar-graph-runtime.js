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

  function edgeProvenance(edge, state) {
    if (!edge) {
      return 'Unknown';
    }
    if (isObsidianEdge(edge, state)) {
      return 'Wikilink';
    }
    const metadata = metadataForEdge(edge, state);
    const hasMetadata = [
      metadata.context,
      metadata.relation,
      metadata.label,
      metadata.title,
      edge.context,
      edge.relation,
      edge.label,
      edge.title
    ].some((value) => asLabel(value));
    return hasMetadata ? 'Graphify' : 'Unknown';
  }

  function nodeById(nodes, nodeId) {
    const key = idKey(nodeId);
    return (nodes || []).find((node) => idKey(node.id) === key) || null;
  }

  function nodeDisplayLabel(node, nodeId) {
    return asLabel(node?.label || node?.title || node?.name || nodeId || 'Unknown node');
  }

  function sourceFileForEdge(edge, nodes) {
    const sourceNode = nodeById(nodes, edgeSource(edge));
    const targetNode = nodeById(nodes, edgeTarget(edge));
    return sourceFileForNode(sourceNode) || sourceFileForNode(targetNode) || '';
  }

  function edgeInspectorDetails(edge, options = {}) {
    if (!edge) {
      return {
        available: false,
        message: 'Connection metadata unavailable'
      };
    }

    const state = { graphLinks: options.graphLinks || [] };
    const nodes = options.nodes || [];
    const sourceNode = nodeById(nodes, edgeSource(edge));
    const targetNode = nodeById(nodes, edgeTarget(edge));
    const relationship = relationForEdge(edge, state) || 'Connection';
    return {
      available: true,
      edgeId: idKey(edge.id),
      sourceId: idKey(edgeSource(edge)),
      targetId: idKey(edgeTarget(edge)),
      sourceLabel: nodeDisplayLabel(sourceNode, edgeSource(edge)),
      targetLabel: nodeDisplayLabel(targetNode, edgeTarget(edge)),
      relationship,
      provenance: edgeProvenance(edge, state),
      sourceFile: sourceFileForEdge(edge, nodes)
    };
  }

  function computeFocusDiff(options = {}) {
    const centerNodeId = idKey(options.centerNodeId);
    const depth = clamp(Number(options.depth) || 1, 1, 3);
    const originalNodes = options.originalNodes || [];
    const originalEdges = options.originalEdges || [];
    const currentNodes = options.currentNodes || originalNodes;
    const currentEdges = options.currentEdges || originalEdges;

    if (!centerNodeId) {
      return {
        centerNodeId: '',
        depth,
        visibleNodeIds: [],
        visibleEdgeIds: [],
        nodeUpdates: [],
        edgeUpdates: []
      };
    }

    const adjacency = new Map();
    originalEdges.forEach((edge) => {
      const source = idKey(edgeSource(edge));
      const target = idKey(edgeTarget(edge));
      if (!source || !target) {
        return;
      }
      if (!adjacency.has(source)) {
        adjacency.set(source, new Set());
      }
      if (!adjacency.has(target)) {
        adjacency.set(target, new Set());
      }
      adjacency.get(source).add(target);
      adjacency.get(target).add(source);
    });

    const visibleNodeIds = new Set([centerNodeId]);
    let frontier = new Set([centerNodeId]);
    for (let level = 0; level < depth; level += 1) {
      const next = new Set();
      frontier.forEach((nodeId) => {
        (adjacency.get(nodeId) || []).forEach((neighborId) => {
          if (!visibleNodeIds.has(neighborId)) {
            visibleNodeIds.add(neighborId);
            next.add(neighborId);
          }
        });
      });
      frontier = next;
    }

    const visibleEdgeIds = new Set();
    originalEdges.forEach((edge) => {
      const source = idKey(edgeSource(edge));
      const target = idKey(edgeTarget(edge));
      if (visibleNodeIds.has(source) && visibleNodeIds.has(target)) {
        visibleEdgeIds.add(idKey(edge.id));
      }
    });

    const currentNodeHidden = hiddenMap(currentNodes);
    const currentEdgeHidden = hiddenMap(currentEdges);
    const nodeUpdates = [];
    const edgeUpdates = [];

    originalNodes.forEach((node) => {
      const desiredHidden = !visibleNodeIds.has(idKey(node.id));
      if ((currentNodeHidden.get(idKey(node.id)) || false) !== desiredHidden) {
        nodeUpdates.push({ id: node.id, hidden: desiredHidden });
      }
    });

    originalEdges.forEach((edge) => {
      const desiredHidden = !visibleEdgeIds.has(idKey(edge.id));
      if ((currentEdgeHidden.get(idKey(edge.id)) || false) !== desiredHidden) {
        edgeUpdates.push({ id: edge.id, hidden: desiredHidden });
      }
    });

    return {
      centerNodeId,
      depth,
      visibleNodeIds: Array.from(visibleNodeIds),
      visibleEdgeIds: Array.from(visibleEdgeIds),
      nodeUpdates,
      edgeUpdates
    };
  }

  function computeGraphHealth(options = {}) {
    const nodes = options.nodes || [];
    const edges = options.edges || [];
    const graphLinks = options.graphLinks || [];
    const state = { graphLinks };
    const degree = new Map(nodes.map((node) => [idKey(node.id), 0]));
    const adjacency = new Map(nodes.map((node) => [idKey(node.id), new Set()]));
    let wikilinkCount = 0;
    let graphifyCount = 0;

    edges.forEach((edge) => {
      const source = idKey(edgeSource(edge));
      const target = idKey(edgeTarget(edge));
      if (!degree.has(source) || !degree.has(target)) {
        return;
      }
      degree.set(source, degree.get(source) + 1);
      degree.set(target, degree.get(target) + 1);
      adjacency.get(source).add(target);
      adjacency.get(target).add(source);
      if (isObsidianEdge(edge, state)) {
        wikilinkCount += 1;
      } else {
        graphifyCount += 1;
      }
    });

    const orphanNodes = nodes
      .filter((node) => (degree.get(idKey(node.id)) || 0) === 0)
      .map((node) => healthNode(node, 0));

    const averageDegree = nodes.length > 0
      ? Array.from(degree.values()).reduce((sum, value) => sum + value, 0) / nodes.length
      : 0;
    const hubThreshold = Math.max(8, Math.ceil(averageDegree * 3));
    const hubNodes = nodes
      .map((node) => healthNode(node, degree.get(idKey(node.id)) || 0))
      .filter((node) => node.degree >= hubThreshold)
      .sort((left, right) => right.degree - left.degree || left.label.localeCompare(right.label))
      .slice(0, 24);

    const visited = new Set();
    const components = [];
    nodes.forEach((node) => {
      const start = idKey(node.id);
      if (visited.has(start)) {
        return;
      }
      const queue = [start];
      const component = [];
      visited.add(start);
      while (queue.length > 0) {
        const current = queue.shift();
        component.push(current);
        (adjacency.get(current) || []).forEach((neighbor) => {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        });
      }
      components.push(component);
    });
    components.sort((left, right) => right.length - left.length);

    const staleCentralNodes = nodes
      .map((node) => ({ node, degree: degree.get(idKey(node.id)) || 0, modifiedAt: node.mtime || node.modified_at || node.modifiedAt }))
      .filter((item) => item.degree >= hubThreshold && item.modifiedAt)
      .sort((left, right) => String(left.modifiedAt).localeCompare(String(right.modifiedAt)))
      .slice(0, 12)
      .map((item) => ({ ...healthNode(item.node, item.degree), modifiedAt: item.modifiedAt }));

    return {
      counts: {
        nodes: nodes.length,
        edges: edges.length,
        graphifyEdges: graphifyCount,
        wikilinkEdges: wikilinkCount,
        components: components.length
      },
      orphanNodes: orphanNodes.slice(0, 40),
      hubNodes,
      isolatedComponents: components
        .filter((component, index) => index > 0 && component.length > 1)
        .slice(0, 12)
        .map((component) => ({ size: component.length, nodeIds: component.slice(0, 12) })),
      staleCentralNodes
    };
  }

  function healthNode(node, degree) {
    return {
      id: idKey(node.id),
      label: nodeDisplayLabel(node, node?.id),
      sourceFile: sourceFileForNode(node),
      degree
    };
  }

  function fileMetadataForNode(node) {
    const metadata = root.__brainBarNodeFileMetadata || {};
    const byNodeId = metadata.byNodeId || {};
    const bySourceFile = metadata.bySourceFile || {};
    const sourceFile = sourceFileForNode(node);
    return byNodeId[idKey(node?.id)] || (sourceFile ? bySourceFile[sourceFile] : null) || {};
  }

  function nodeTimestamp(node) {
    const fileMetadata = fileMetadataForNode(node);
    const explicit = node?.mtime || node?.modified_at || node?.modifiedAt || fileMetadata.mtime || fileMetadata.modifiedAt;
    if (explicit) {
      if (typeof explicit === 'number') {
        return explicit > 10000000000 ? explicit : explicit * 1000;
      }
      const parsed = Date.parse(explicit);
      return Number.isNaN(parsed) ? Number(explicit) || 0 : parsed;
    }

    const haystack = [
      node?.label,
      node?.title,
      node?.id,
      sourceFileForNode(node)
    ].map((value) => String(value || '')).join(' ');
    const dashed = haystack.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    if (dashed) {
      return Date.parse(`${dashed[1]}-${dashed[2]}-${dashed[3]}T00:00:00Z`) || 0;
    }
    const compact = haystack.match(/\b(20\d{2})(\d{2})(\d{2})\b/);
    if (compact) {
      return Date.parse(`${compact[1]}-${compact[2]}-${compact[3]}T00:00:00Z`) || 0;
    }
    return 0;
  }

  function recentNodeIds(nodes, limit = 80) {
    return (nodes || [])
      .map((node) => ({ node, timestamp: nodeTimestamp(node) }))
      .filter((item) => item.timestamp > 0)
      .sort((left, right) => right.timestamp - left.timestamp || nodeDisplayLabel(left.node, left.node?.id).localeCompare(nodeDisplayLabel(right.node, right.node?.id)))
      .slice(0, limit)
      .map((item) => item.node.id);
  }

  function workflowViewState(options = {}) {
    const nodes = options.nodes || [];
    const edges = options.edges || [];
    const graphLinks = options.graphLinks || [];
    const reviewQueueTargets = options.reviewQueueTargets || [];
    const health = options.health || computeGraphHealth({ nodes, edges, graphLinks });
    const reviewTargets = reviewQueueNodeTargetsFromNodes(nodes, reviewQueueTargets);
    const recent = recentNodeIds(nodes);
    return {
      orphans: { count: health.orphanNodes.length, hidden: false, disabled: false },
      hubs: { count: health.hubNodes.length, hidden: false, disabled: false },
      review: { count: reviewTargets.length, hidden: reviewTargets.length === 0, disabled: reviewTargets.length === 0 },
      recent: { count: recent.length, hidden: false, disabled: recent.length === 0 },
      wikilinks: { count: health.counts.wikilinkEdges, hidden: false, disabled: health.counts.wikilinkEdges === 0 },
      graphify: { count: health.counts.graphifyEdges, hidden: false, disabled: health.counts.graphifyEdges === 0 }
    };
  }

  function describeWorkflowView(view, count = 0) {
    const descriptions = {
      global: {
        activeName: 'global',
        title: 'All Notes',
        body: 'The full graph. Useful as a map, but usually too dense for close reading.'
      },
      orphans: {
        activeName: 'orphans',
        title: 'Needs Links',
        body: 'Notes with no graph connections. These are candidates to link, merge, or leave intentionally isolated.',
        empty: 'No notes need links right now.'
      },
      hubs: {
        activeName: 'hubs',
        title: 'Key Notes',
        body: 'The most connected notes. They often act as indexes, protocols, dashboards, or central concepts.',
        empty: 'No key notes found.'
      },
      review: {
        activeName: 'review',
        title: 'Review',
        body: 'Review Queue items that point to a graph node. Items need source_file or node_id to appear here.',
        empty: 'No Review Queue items currently point to graph nodes.'
      },
      recent: {
        activeName: 'recent',
        title: 'Recent Notes',
        body: 'Recently changed or date-named notes. Uses mtime when available, otherwise dates found in titles or paths.',
        empty: 'No recent-date metadata found in this graph.'
      },
      health: {
        activeName: 'health',
        title: 'Graph Check',
        body: 'A read-only check for notes that need links, key notes, disconnected groups, and stale key notes when timestamps exist.'
      },
      component: {
        activeName: 'component',
        title: 'Disconnected Group',
        body: 'A smaller connected group outside the main graph. These may be intentional islands or areas that need bridge links.',
        empty: 'This disconnected group has no visible nodes.'
      }
    };
    const fallback = descriptions.global;
    return {
      ...(descriptions[String(view || '').toLowerCase()] || fallback),
      count
    };
  }

  function reviewQueueNodeTargetsFromNodes(nodes, targets) {
    const nodeIds = new Set();
    const nodesBySource = new Map();
    (nodes || []).forEach((node) => {
      const source = sourceFileForNode(node);
      if (source) {
        nodesBySource.set(source, node.id);
      }
    });
    (targets || []).forEach((target) => {
      if (target.node_id) {
        nodeIds.add(String(target.node_id));
      }
      if (target.source_file && nodesBySource.has(target.source_file)) {
        nodeIds.add(String(nodesBySource.get(target.source_file)));
      }
    });
    return Array.from(nodeIds);
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

    function isGraphPointerTarget(target) {
      if (!target || typeof target.closest !== 'function') {
        return false;
      }
      const graph = root.document.getElementById('graph');
      return Boolean(graph && (target === graph || graph.contains(target)));
    }

    function handlePremiumTooltipPointerMove(event) {
      if (!isGraphPointerTarget(event.target)) {
        hidePremiumTooltip();
        return;
      }
      movePremiumTooltip(event);
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
        const existingButton = root.document.getElementById('brainbar-open-note');
        if (existingButton) {
          existingButton.dataset.nodeId = String(nodeId);
          addFocusControls(nodeId);
          return;
        }
        if (!info || !sourceFile) {
          return;
        }
        const button = root.document.createElement('button');
        button.id = 'brainbar-open-note';
        button.type = 'button';
        button.dataset.nodeId = String(nodeId);
        button.textContent = 'Open Note';
        info.insertBefore(button, info.children[1] || null);
        addFocusControls(nodeId);
      } catch (error) {
        console.debug('BrainBar open note button skipped', error);
      }
    }

    function showEdgeInspector(edgeId) {
      try {
        const edge = graphEdgesDS()?.get(edgeId) || null;
        const snapshot = currentGraphSnapshot();
        const details = edgeInspectorDetails(edge, {
          nodes: snapshot.nodes,
          graphLinks: snapshot.state.graphLinks || []
        });
        const info = root.document.getElementById('info-content');
        if (!info) {
          return;
        }

        let panel = root.document.getElementById('brainbar-edge-inspector');
        if (!panel) {
          panel = root.document.createElement('div');
          panel.id = 'brainbar-edge-inspector';
        }
        panel.innerHTML = '';

        const eyebrow = root.document.createElement('div');
        eyebrow.className = 'edge-eyebrow';
        eyebrow.textContent = 'Connection';
        const title = root.document.createElement('strong');
        title.textContent = details.available
          ? `${details.sourceLabel} -> ${details.targetLabel}`
          : details.message;
        panel.append(eyebrow, title);

        if (details.available) {
          [
            ['Relationship', details.relationship],
            ['Source', details.provenance],
            ['File', details.sourceFile || 'Connection metadata unavailable']
          ].forEach(([label, value]) => {
            const row = root.document.createElement('div');
            row.className = 'edge-row';
            const key = root.document.createElement('span');
            key.textContent = label;
            const val = root.document.createElement('b');
            val.textContent = value;
            row.append(key, val);
            panel.appendChild(row);
          });

          if (details.sourceFile) {
            const actions = root.document.createElement('div');
            actions.className = 'edge-actions';
            const open = root.document.createElement('button');
            open.type = 'button';
            open.textContent = 'Open Source Note';
            open.addEventListener('click', () => {
              sendNodeAction('openNode', {
                id: details.sourceId,
                label: details.sourceLabel,
                source_file: details.sourceFile
              });
            });
            const copy = root.document.createElement('button');
            copy.type = 'button';
            copy.textContent = 'Copy Path';
            copy.addEventListener('click', () => {
              root.navigator?.clipboard?.writeText(details.sourceFile);
            });
            actions.append(open, copy);
            panel.appendChild(actions);
          }
        }

        info.prepend(panel);
      } catch (error) {
        console.debug('BrainBar edge inspector skipped', error);
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

    function applyDataSetUpdates(nodeUpdates, edgeUpdates) {
      const nodesDataSet = graphNodesDS();
      const edgesDataSet = graphEdgesDS();
      if (edgeUpdates?.length > 0 && edgesDataSet) {
        edgesDataSet.update(edgeUpdates);
      }
      if (nodeUpdates?.length > 0 && nodesDataSet) {
        nodesDataSet.update(nodeUpdates);
      }
      graphNetwork()?.redraw();
    }

    function clearRuntimeFilter() {
      const state = ensureGraphLensState();
      const nodesDataSet = graphNodesDS();
      const edgesDataSet = graphEdgesDS();
      if (!state || !nodesDataSet || !edgesDataSet) {
        return;
      }
      root.__brainBarFocusState = null;
      root.__brainBarActiveGraphView = 'global';
      setLensEmptyMessage('');
      const resetAll = computeLensDiff({
        lens: root.__brainBarPendingGraphLens || ALL_LENS,
        originalNodes: state.originalNodes,
        originalEdges: state.originalEdges,
        graphLinks: state.graphLinks,
        currentNodes: nodesDataSet.get(),
        currentEdges: edgesDataSet.get()
      });
      applyDataSetUpdates(resetAll.nodeUpdates, resetAll.edgeUpdates);
      updateFocusStatus(null);
      updateWorkflowToolbarState();
    }

    function applyFocus(centerNodeId, depth = 1) {
      const state = ensureGraphLensState();
      const nodesDataSet = graphNodesDS();
      const edgesDataSet = graphEdgesDS();
      if (!state || !nodesDataSet || !edgesDataSet || !centerNodeId) {
        return;
      }

      const focus = computeFocusDiff({
        centerNodeId,
        depth,
        originalNodes: state.originalNodes,
        originalEdges: state.originalEdges,
        currentNodes: nodesDataSet.get(),
        currentEdges: edgesDataSet.get()
      });
      root.__brainBarFocusState = focus;
      root.__brainBarActiveGraphView = 'focus';
      setLensEmptyMessage(focus.visibleNodeIds.length === 0 ? 'Focus node not found' : '');
      applyDataSetUpdates(focus.nodeUpdates, focus.edgeUpdates);
      updateWorkflowToolbarState();
      updateFocusStatus(focus);
      graphNetwork()?.selectNodes([centerNodeId]);
      graphNetwork()?.focus(centerNodeId, {
        scale: focus.depth <= 1 ? 0.95 : 0.72,
        animation: { duration: 260, easingFunction: 'easeInOutQuad' }
      });
    }

    function expandFocus() {
      const focus = root.__brainBarFocusState;
      if (!focus?.centerNodeId) {
        return;
      }
      applyFocus(focus.centerNodeId, clamp((focus.depth || 1) + 1, 1, 3));
    }

    function addFocusControls(nodeId) {
      const info = root.document.getElementById('info-content');
      if (!info || !nodeId) {
        return;
      }
      let controls = root.document.getElementById('brainbar-focus-controls');
      if (!controls) {
        controls = root.document.createElement('div');
        controls.id = 'brainbar-focus-controls';
        controls.innerHTML = `
          <div class="focus-status" hidden></div>
          <button type="button" data-action="focus">Focus note</button>
          <button type="button" data-action="expand">Expand neighbors</button>
          <button type="button" data-action="clear">Back to all</button>
        `;
        controls.addEventListener('click', (event) => {
          const button = event.target.closest('button[data-action]');
          if (!button) {
            return;
          }
          event.preventDefault();
          const selected = graphNetwork()?.getSelectedNodes?.()?.[0] || controls.dataset.nodeId;
          if (button.dataset.action === 'focus') {
            applyFocus(selected, 1);
          } else if (button.dataset.action === 'expand') {
            expandFocus();
          } else {
            clearRuntimeFilter();
          }
        });
      }
      controls.dataset.nodeId = String(nodeId);
      if (!controls.parentElement) {
        const openButton = root.document.getElementById('brainbar-open-note');
        info.insertBefore(controls, openButton?.nextSibling || info.children[1] || null);
      }
      updateFocusStatus(root.__brainBarFocusState);
    }

    function updateFocusStatus(focus) {
      const controls = root.document.getElementById('brainbar-focus-controls');
      if (!controls) {
        return;
      }
      const status = controls.querySelector('.focus-status');
      const expand = controls.querySelector('button[data-action="expand"]');
      if (!status) {
        return;
      }
      if (!focus?.centerNodeId) {
        status.hidden = true;
        if (expand) {
          expand.disabled = false;
        }
        return;
      }
      status.hidden = false;
      status.textContent = `Focused · depth ${focus.depth} · ${focus.visibleNodeIds.length} notes`;
      if (expand) {
        expand.disabled = focus.depth >= 3;
      }
    }

    function currentGraphSnapshot() {
      const state = ensureGraphLensState() || {};
      const nodesDataSet = graphNodesDS();
      const edgesDataSet = graphEdgesDS();
      return {
        state,
        nodes: state.originalNodes || nodesDataSet?.get() || [],
        edges: state.originalEdges || edgesDataSet?.get() || [],
        currentNodes: nodesDataSet?.get() || [],
        currentEdges: edgesDataSet?.get() || []
      };
    }

    function applyNodeSetView(viewName, nodeIds) {
      const viewMeta = describeWorkflowView(viewName, nodeIds?.length || 0);
      const snapshot = currentGraphSnapshot();
      const visibleNodeIds = new Set((nodeIds || []).map(idKey));
      const visibleEdgeIds = new Set();
      snapshot.edges.forEach((edge) => {
        if (visibleNodeIds.has(idKey(edgeSource(edge))) && visibleNodeIds.has(idKey(edgeTarget(edge)))) {
          visibleEdgeIds.add(idKey(edge.id));
        }
      });

      const nodeHidden = hiddenMap(snapshot.currentNodes);
      const edgeHidden = hiddenMap(snapshot.currentEdges);
      const nodeUpdates = snapshot.nodes.map((node) => ({ id: node.id, hidden: !visibleNodeIds.has(idKey(node.id)) }))
        .filter((update) => (nodeHidden.get(idKey(update.id)) || false) !== update.hidden);
      const edgeUpdates = snapshot.edges.map((edge) => ({ id: edge.id, hidden: !visibleEdgeIds.has(idKey(edge.id)) }))
        .filter((update) => (edgeHidden.get(idKey(update.id)) || false) !== update.hidden);

      root.__brainBarFocusState = null;
      root.__brainBarActiveGraphView = viewMeta.activeName;
      setLensEmptyMessage(visibleNodeIds.size === 0 ? viewMeta.empty : '');
      applyDataSetUpdates(nodeUpdates, edgeUpdates);
      updateWorkflowToolbarState();
      showWorkflowViewPanel(viewMeta, Array.from(visibleNodeIds));
      if (visibleNodeIds.size === 1) {
        const nodeId = Array.from(visibleNodeIds)[0];
        graphNetwork()?.selectNodes([nodeId]);
        graphNetwork()?.focus(nodeId, {
          scale: 1.35,
          animation: { duration: 280, easingFunction: 'easeInOutQuad' }
        });
      } else if (visibleNodeIds.size > 1) {
        graphNetwork()?.fit({
          nodes: Array.from(visibleNodeIds),
          animation: { duration: 260, easingFunction: 'easeInOutQuad' }
        });
      }
    }

    function applyBuiltInView(viewName) {
      const view = String(viewName || 'global').toLowerCase();
      const snapshot = currentGraphSnapshot();
      const health = computeGraphHealth({
        nodes: snapshot.nodes,
        edges: snapshot.edges,
        graphLinks: snapshot.state.graphLinks || []
      });

      if (view === 'global') {
        clearRuntimeFilter();
        hideWorkflowViewPanel();
      } else if (view === 'orphans') {
        applyNodeSetView('orphans', health.orphanNodes.map((node) => node.id));
      } else if (view === 'hubs') {
        applyNodeSetView('hubs', health.hubNodes.map((node) => node.id));
      } else if (view === 'review') {
        const targets = reviewQueueNodeTargets(snapshot.nodes, root.__brainBarReviewQueueTargets || []);
        applyNodeSetView('review', targets);
      } else if (view === 'recent') {
        applyNodeSetView('recent', recentNodeIds(snapshot.nodes));
      } else if (view === 'wikilinks') {
        hideWorkflowViewPanel();
        root.brainBarApplyGraphLens(OBSIDIAN_LENS);
      } else if (view === 'graphify') {
        hideWorkflowViewPanel();
        root.brainBarApplyGraphLens(GRAPHIFY_LENS);
      } else if (view === 'health') {
        showGraphHealthPanel(health);
      }
    }

    function reviewQueueNodeTargets(nodes, targets) {
      return reviewQueueNodeTargetsFromNodes(nodes, targets);
    }

    function ensureWorkflowToolbar() {
      let toolbar = root.document.getElementById('brainbar-workflow-toolbar');
      if (toolbar) {
        return toolbar;
      }
      toolbar = root.document.createElement('div');
      toolbar.id = 'brainbar-workflow-toolbar';
      [
        ['global', 'All'],
        ['orphans', 'Needs Links'],
        ['hubs', 'Key Notes'],
        ['review', 'Review'],
        ['recent', 'Recent'],
        ['wikilinks', 'Wikilinks'],
        ['graphify', 'Graphify'],
        ['health', 'Graph Check']
      ].forEach(([view, label]) => {
        const button = root.document.createElement('button');
        button.type = 'button';
        button.dataset.view = view;
        button.dataset.label = label;
        button.title = describeWorkflowView(view).body;
        button.textContent = label;
        toolbar.appendChild(button);
      });
      toolbar.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-view]');
        if (!button) {
          return;
        }
        event.preventDefault();
        applyBuiltInView(button.dataset.view);
      });
      root.document.body.appendChild(toolbar);
      updateWorkflowToolbarState();
      return toolbar;
    }

    function updateWorkflowToolbarState() {
      const toolbar = root.document.getElementById('brainbar-workflow-toolbar');
      if (!toolbar) {
        return;
      }
      const snapshot = currentGraphSnapshot();
      const health = computeGraphHealth({
        nodes: snapshot.nodes,
        edges: snapshot.edges,
        graphLinks: snapshot.state.graphLinks || []
      });
      const viewState = workflowViewState({
        nodes: snapshot.nodes,
        edges: snapshot.edges,
        graphLinks: snapshot.state.graphLinks || [],
        reviewQueueTargets: root.__brainBarReviewQueueTargets || [],
        health
      });
      const active = String(root.__brainBarActiveGraphView || 'global').toLowerCase();
      toolbar.querySelectorAll('button[data-view]').forEach((button) => {
        const view = String(button.dataset.view || '').toLowerCase();
        const selected = active === view || (active === 'global' && view === 'global');
        const state = viewState[view] || { count: 0, hidden: false, disabled: false };
        const label = button.dataset.label || button.textContent || '';
        button.textContent = state.count > 0 && ['orphans', 'hubs', 'review', 'recent'].includes(view)
          ? `${label} ${state.count}`
          : label;
        button.hidden = Boolean(state.hidden);
        button.disabled = Boolean(state.disabled);
        button.classList.toggle('selected', selected);
      });
    }

    function hideWorkflowViewPanel() {
      const panel = root.document.getElementById('brainbar-workflow-panel');
      if (panel) {
        panel.hidden = true;
      }
    }

    function pathsForNodeIds(nodeIds) {
      const snapshot = currentGraphSnapshot();
      return (nodeIds || [])
        .map((nodeId) => nodeById(snapshot.nodes, nodeId))
        .map(sourceFileForNode)
        .filter(Boolean);
    }

    function showWorkflowViewPanel(meta, nodeIds) {
      let panel = root.document.getElementById('brainbar-workflow-panel');
      if (!panel) {
        panel = root.document.createElement('div');
        panel.id = 'brainbar-workflow-panel';
        root.document.body.appendChild(panel);
      }
      panel.innerHTML = '';

      const close = root.document.createElement('button');
      close.type = 'button';
      close.className = 'close';
      close.textContent = 'Close';
      close.addEventListener('click', () => {
        panel.hidden = true;
      });
      const title = root.document.createElement('h2');
      title.textContent = meta.title;
      const body = root.document.createElement('p');
      body.textContent = `${meta.body} ${meta.count} shown.`;
      panel.append(close, title, body);

      const actions = root.document.createElement('div');
      actions.className = 'workflow-actions';
      const focusFirst = root.document.createElement('button');
      focusFirst.type = 'button';
      focusFirst.textContent = 'Focus first';
      focusFirst.disabled = nodeIds.length === 0;
      focusFirst.addEventListener('click', () => {
        if (nodeIds[0]) {
          applyFocus(nodeIds[0], 1);
          panel.hidden = true;
        }
      });
      const showAll = root.document.createElement('button');
      showAll.type = 'button';
      showAll.textContent = 'Show all';
      showAll.addEventListener('click', () => {
        clearRuntimeFilter();
        panel.hidden = true;
      });
      actions.append(focusFirst, showAll);
      const paths = pathsForNodeIds(nodeIds);
      if (paths.length > 0) {
        const copyPaths = root.document.createElement('button');
        copyPaths.type = 'button';
        copyPaths.textContent = 'Copy paths';
        copyPaths.addEventListener('click', () => {
          root.navigator?.clipboard?.writeText(paths.join('\n'));
        });
        actions.appendChild(copyPaths);
      }
      panel.appendChild(actions);

      if (!nodeIds.length) {
        const empty = root.document.createElement('p');
        empty.className = 'empty';
        empty.textContent = meta.empty || 'No nodes match this view.';
        panel.appendChild(empty);
      } else {
        const snapshot = currentGraphSnapshot();
        const nodesDataSet = graphNodesDS();
        nodeIds.slice(0, 10).forEach((nodeId) => {
          const node = nodesDataSet?.get(nodeId) || nodeById(snapshot.nodes, nodeId);
          const row = root.document.createElement('button');
          row.type = 'button';
          row.className = 'health-row';
          row.textContent = nodeDisplayLabel(node, nodeId);
          row.addEventListener('click', () => {
            graphNetwork()?.selectNodes([nodeId]);
            graphNetwork()?.focus(nodeId, {
              scale: 1.15,
              animation: { duration: 220, easingFunction: 'easeInOutQuad' }
            });
          });
          panel.appendChild(row);
        });
      }

      panel.hidden = false;
    }

    function showGraphHealthPanel(health) {
      let panel = root.document.getElementById('brainbar-health-panel');
      if (!panel) {
        panel = root.document.createElement('div');
        panel.id = 'brainbar-health-panel';
        root.document.body.appendChild(panel);
      }
      panel.innerHTML = '';
      const close = root.document.createElement('button');
      close.type = 'button';
      close.className = 'close';
      close.textContent = 'Close';
      close.addEventListener('click', () => {
        panel.hidden = true;
      });
      const title = root.document.createElement('h2');
      title.textContent = 'Graph Check';
      const summary = root.document.createElement('p');
      summary.textContent = `Read-only check: ${health.counts.nodes} notes, ${health.counts.edges} links, ${health.counts.components} connected groups.`;
      panel.append(close, title, summary);
      appendGraphCheckActions(panel, health);
      appendHealthList(panel, 'Needs Links', health.orphanNodes, 'No notes need links right now.');
      appendHealthList(panel, 'Key Notes', health.hubNodes, 'No unusually connected notes found.');
      appendComponentList(panel, 'Disconnected Groups', health.isolatedComponents);
      if (health.staleCentralNodes.length > 0) {
        appendHealthList(panel, 'Stale Key Notes', health.staleCentralNodes);
      }
      panel.hidden = false;
    }

    function appendGraphCheckActions(panel, health) {
      const actions = root.document.createElement('div');
      actions.className = 'workflow-actions';
      const focusFirst = root.document.createElement('button');
      focusFirst.type = 'button';
      focusFirst.textContent = 'Focus first issue';
      const firstNode = health.orphanNodes[0] || health.hubNodes[0] || health.staleCentralNodes[0];
      focusFirst.disabled = !firstNode;
      focusFirst.addEventListener('click', () => {
        if (firstNode?.id) {
          applyFocus(firstNode.id, 1);
          panel.hidden = true;
        }
      });
      const showAll = root.document.createElement('button');
      showAll.type = 'button';
      showAll.textContent = 'Show all';
      showAll.addEventListener('click', () => {
        clearRuntimeFilter();
        panel.hidden = true;
      });
      actions.append(focusFirst, showAll);
      const paths = [...health.orphanNodes, ...health.hubNodes, ...health.staleCentralNodes]
        .map((node) => node.sourceFile)
        .filter(Boolean);
      if (paths.length > 0) {
        const copy = root.document.createElement('button');
        copy.type = 'button';
        copy.textContent = 'Copy paths';
        copy.addEventListener('click', () => {
          root.navigator?.clipboard?.writeText(paths.join('\n'));
        });
        actions.appendChild(copy);
      }
      panel.appendChild(actions);
    }

    function appendHealthList(panel, title, nodes, emptyText = 'Nothing to review') {
      const section = root.document.createElement('section');
      const heading = root.document.createElement('h3');
      heading.textContent = `${title} (${nodes.length})`;
      section.appendChild(heading);
      if (nodes.length === 0) {
        const empty = root.document.createElement('p');
        empty.className = 'empty';
        empty.textContent = emptyText;
        section.appendChild(empty);
      } else {
        nodes.slice(0, 8).forEach((node) => {
          const row = root.document.createElement('button');
          row.type = 'button';
          row.className = 'health-row';
          row.textContent = `${node.label}${node.degree ? ` · degree ${node.degree}` : ''}`;
          row.addEventListener('click', () => {
            applyFocus(node.id, 1);
            panel.hidden = true;
          });
          section.appendChild(row);
        });
      }
      panel.appendChild(section);
    }

    function appendComponentList(panel, title, components) {
      const section = root.document.createElement('section');
      const heading = root.document.createElement('h3');
      heading.textContent = `${title} (${components.length})`;
      section.appendChild(heading);
      if (components.length === 0) {
        const empty = root.document.createElement('p');
        empty.className = 'empty';
        empty.textContent = 'All connected groups beyond the main graph are tiny or absent.';
        section.appendChild(empty);
      } else {
        components.slice(0, 8).forEach((component, index) => {
          const row = root.document.createElement('button');
          row.type = 'button';
          row.className = 'health-row';
          row.textContent = `Group ${index + 1} · ${component.size} notes`;
          row.addEventListener('click', () => {
            applyNodeSetView('component', component.nodeIds || []);
            panel.hidden = true;
          });
          section.appendChild(row);
        });
      }
      panel.appendChild(section);
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

      root.document.addEventListener('mousemove', handlePremiumTooltipPointerMove, { passive: true });
      root.document.getElementById('graph')?.addEventListener('mouseleave', hidePremiumTooltip, { passive: true });

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
      currentNetwork.on('selectEdge', (params) => {
        hidePremiumTooltip();
        const selectedEdgeId = params.edges?.[0];
        if (selectedEdgeId !== undefined && selectedEdgeId !== null) {
          showEdgeInspector(selectedEdgeId);
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
              borderWidth: 0.85,
              borderWidthSelected: 1.7,
              shadow: {
                enabled: true,
                color: 'rgba(126, 154, 255, 0.16)',
                size: 3,
                x: 0,
                y: 0
              },
              scaling: {
                min: 3,
                max: 11,
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
            ? 3.2
            : clamp(3.4 + Math.sqrt(degree) * 0.74, 4.2, 9.2);
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
              enabled: degree > 18,
              color: 'rgba(126, 154, 255, 0.12)',
              size: clamp(Math.sqrt(degree) * 0.72, 2, 5),
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
          const baseWidth = Math.max(0.45, Math.min(edge._brainBarBaseWidth || edge.width || 0.75, 0.95));
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
      ensureWorkflowToolbar();
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
      root.__brainBarActiveGraphView = selectedLens === ALL_LENS
        ? 'global'
        : (selectedLens === OBSIDIAN_LENS ? 'wikilinks' : 'graphify');
      updateWorkflowToolbarState();
    };

    root.brainBarApplyReviewQueueTargets = (targets) => {
      root.__brainBarReviewQueueTargets = Array.isArray(targets) ? targets : [];
      updateWorkflowToolbarState();
      if (String(root.__brainBarActiveGraphView || '').toLowerCase() === 'review') {
        applyBuiltInView('review');
      }
    };

    root.brainBarShowGraphHealth = () => {
      applyBuiltInView('health');
    };

    function applyBrainBarGraphRuntime() {
      applyNetworkTheme();
      rebuildEmptyCommunityLegend();
      ensureWorkflowToolbar();
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
    computeFocusDiff,
    computeGraphHealth,
    computeLensDiff,
    describeWorkflowView,
    edgeInspectorDetails,
    edgeProvenance,
    edgeSource,
    edgeTarget,
    fileMetadataForNode,
    isObsidianEdge,
    metadataForEdge,
    nodeActionPayload,
    nodeTimestamp,
    nodeTooltipLabel,
    normalizeLens,
    recentNodeIds,
    workflowViewState,
    sourceFileForNode
  };

  installBrowserRuntime();
  return api;
});
