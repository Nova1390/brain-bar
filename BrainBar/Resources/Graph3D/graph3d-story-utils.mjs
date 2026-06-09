import { recentOrbitCandidates } from './graph3d-recent-utils.mjs';

const defaultLimits = {
  recent: 12,
  keyNotes: 12,
  communities: 3,
  bridgeNotes: 10,
  edges: 160
};

export function buildGraphStorySteps({
  nodes = [],
  edges = [],
  communities = [],
  degreeByNode = new Map(),
  metadata = {},
  limits = {}
} = {}) {
  const mergedLimits = { ...defaultLimits, ...limits };
  const steps = [];
  const recentStep = recentStoryStep({ nodes, edges, metadata, limit: mergedLimits.recent, edgeLimit: mergedLimits.edges });
  const keyStep = keyNoteStoryStep({ nodes, edges, degreeByNode, limit: mergedLimits.keyNotes, edgeLimit: mergedLimits.edges });
  const communitySteps = communityStorySteps({ nodes, edges, communities, degreeByNode, limit: mergedLimits.communities });
  const bridgeStep = bridgeNoteStoryStep({ nodes, edges, degreeByNode, limit: mergedLimits.bridgeNotes, edgeLimit: mergedLimits.edges });
  const attentionStep = needsAttentionStoryStep({ nodes, edges, degreeByNode, limit: mergedLimits.keyNotes, edgeLimit: mergedLimits.edges });

  [recentStep, keyStep, ...communitySteps, bridgeStep, attentionStep]
    .filter(Boolean)
    .forEach((step) => steps.push(step));

  return steps;
}

export function keyNoteStoryStep({ nodes = [], edges = [], degreeByNode = new Map(), limit = defaultLimits.keyNotes, edgeLimit = defaultLimits.edges } = {}) {
  const items = rankedNodesByDegree(nodes, degreeByNode)
    .filter((item) => item.degree > 0)
    .slice(0, limit);
  if (!items.length) {
    return null;
  }
  const nodeIds = new Set(items.map((item) => item.id));
  return {
    id: 'key-notes',
    type: 'key-notes',
    title: 'Your most connected notes',
    summary: 'These notes act as index, protocol, or context anchors in the visible graph.',
    nodeIds,
    focusNodeIds: new Set(nodeIds),
    edgeIds: edgeIdsTouchingNodes(edges, nodeIds, edgeLimit),
    activeNodeId: items[0].id,
    activeCommunityName: null,
    count: items.length,
    items: items.map((item) => ({
      kind: 'node',
      id: item.id,
      label: item.label,
      detail: `${item.degree} visible ${item.degree === 1 ? 'link' : 'links'}`
    }))
  };
}

export function communityStorySteps({ nodes = [], edges = [], communities = [], degreeByNode = new Map(), limit = defaultLimits.communities } = {}) {
  const communityCounts = communityCountMap(nodes);
  const orderedCommunities = (communities.length
    ? communities.map((community) => ({
      name: String(community.name || community.id || ''),
      count: Number(community.count ?? communityCounts.get(String(community.name || community.id || '')) ?? 0)
    }))
    : Array.from(communityCounts.entries()).map(([name, count]) => ({ name, count })))
    .filter((community) => community.name && community.count > 0)
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, limit);

  return orderedCommunities.map((community, index) => {
    const communityNodes = nodes.filter((node) => String(node?.community || '') === community.name);
    const rankedNodes = rankedNodesByDegree(communityNodes, degreeByNode).slice(0, 8);
    const nodeIds = new Set(communityNodes.map((node) => String(node?.id ?? '')).filter(Boolean));
    const internalEdgeCount = edges.filter((edge) => nodeIds.has(endpointId(edge.source ?? edge.from)) && nodeIds.has(endpointId(edge.target ?? edge.to))).length;
    return {
      id: `community-${index + 1}`,
      type: 'community',
      title: `Largest visible community ${index + 1}`,
      summary: `${community.name} contains ${community.count} visible notes and ${internalEdgeCount} internal visible ${internalEdgeCount === 1 ? 'edge' : 'edges'}.`,
      nodeIds,
      focusNodeIds: new Set(rankedNodes.map((item) => item.id)),
      edgeIds: new Set(),
      activeNodeId: rankedNodes[0]?.id || null,
      activeCommunityName: community.name,
      count: community.count,
      items: rankedNodes.map((item) => ({
        kind: 'node',
        id: item.id,
        label: item.label,
        detail: `${item.degree} visible ${item.degree === 1 ? 'link' : 'links'}`
      }))
    };
  });
}

export function bridgeNoteStoryStep({ nodes = [], edges = [], degreeByNode = new Map(), limit = defaultLimits.bridgeNotes, edgeLimit = defaultLimits.edges } = {}) {
  const nodeById = new Map(nodes.map((node) => [String(node?.id ?? ''), node]));
  const bridgeCounts = new Map();
  const crossingEdges = [];
  edges.forEach((edge) => {
    const sourceId = endpointId(edge.source ?? edge.from);
    const targetId = endpointId(edge.target ?? edge.to);
    const source = nodeById.get(sourceId);
    const target = nodeById.get(targetId);
    if (!source || !target || String(source.community || '') === String(target.community || '')) {
      return;
    }
    crossingEdges.push({ ...edge, source: sourceId, target: targetId, id: String(edge.id ?? `${sourceId}-${targetId}`) });
    bridgeCounts.set(sourceId, (bridgeCounts.get(sourceId) ?? 0) + 1);
    bridgeCounts.set(targetId, (bridgeCounts.get(targetId) ?? 0) + 1);
  });

  const items = Array.from(bridgeCounts.entries())
    .map(([id, bridgeCount]) => {
      const node = nodeById.get(id);
      return {
        id,
        label: labelForNode(node, id),
        bridgeCount,
        degree: degreeForNode(id, degreeByNode)
      };
    })
    .sort((left, right) => right.bridgeCount - left.bridgeCount || right.degree - left.degree || left.label.localeCompare(right.label))
    .slice(0, limit);

  if (!items.length) {
    return null;
  }

  const nodeIds = new Set(items.map((item) => item.id));
  const edgeIds = crossingEdges
    .filter((edge) => nodeIds.has(edge.source) || nodeIds.has(edge.target))
    .sort((left, right) => {
      const leftScore = (bridgeCounts.get(left.source) ?? 0) + (bridgeCounts.get(left.target) ?? 0);
      const rightScore = (bridgeCounts.get(right.source) ?? 0) + (bridgeCounts.get(right.target) ?? 0);
      return rightScore - leftScore || left.id.localeCompare(right.id);
    })
    .slice(0, edgeLimit)
    .reduce((set, edge) => set.add(edge.id), new Set());

  return {
    id: 'bridge-notes',
    type: 'bridge-notes',
    title: 'Notes connecting communities',
    summary: 'These notes have the most visible links crossing community boundaries.',
    nodeIds,
    focusNodeIds: new Set(nodeIds),
    edgeIds,
    activeNodeId: items[0].id,
    activeCommunityName: null,
    count: items.length,
    items: items.map((item) => ({
      kind: 'node',
      id: item.id,
      label: item.label,
      detail: `${item.bridgeCount} cross-community ${item.bridgeCount === 1 ? 'edge' : 'edges'}`
    }))
  };
}

export function needsAttentionStoryStep({ nodes = [], edges = [], degreeByNode = new Map(), limit = defaultLimits.keyNotes, edgeLimit = defaultLimits.edges } = {}) {
  const nodeIds = new Set(nodes.map((node) => String(node?.id ?? '')).filter(Boolean));
  const adjacency = buildAdjacency(nodeIds, edges);
  const orphanItems = nodes
    .filter((node) => degreeForNode(node?.id, degreeByNode) === 0)
    .map((node) => ({
      id: String(node?.id ?? ''),
      label: labelForNode(node),
      detail: 'No visible links'
    }))
    .filter((item) => item.id);
  const smallGroupItems = disconnectedComponents(nodeIds, adjacency)
    .filter((component) => component.length > 1 && component.length <= 3)
    .flatMap((component) => component.map((id) => ({
      id,
      label: labelForNode(nodes.find((node) => String(node?.id ?? '') === id), id),
      detail: `${component.length}-note disconnected group`
    })));
  const items = [...orphanItems, ...smallGroupItems]
    .filter(uniqueById())
    .slice(0, limit);

  if (!items.length) {
    return null;
  }

  const attentionNodeIds = new Set(items.map((item) => item.id));
  return {
    id: 'needs-attention',
    type: 'needs-attention',
    title: 'Areas that may need links',
    summary: 'These visible notes or small groups are weakly connected in the current view.',
    nodeIds: attentionNodeIds,
    focusNodeIds: new Set(attentionNodeIds),
    edgeIds: edgeIdsTouchingNodes(edges, attentionNodeIds, edgeLimit),
    activeNodeId: items[0].id,
    activeCommunityName: null,
    count: items.length,
    items: items.map((item) => ({ kind: 'node', ...item }))
  };
}

function recentStoryStep({ nodes, edges, metadata, limit, edgeLimit }) {
  const items = recentOrbitCandidates({ nodes, metadata, limit });
  if (!items.length) {
    return null;
  }
  const nodeIds = new Set(items.map((item) => item.id));
  return {
    id: 'recent',
    type: 'recent',
    title: 'Recently changed notes',
    summary: 'These are the newest visible notes by file metadata or date-like labels.',
    nodeIds,
    focusNodeIds: new Set(nodeIds),
    edgeIds: edgeIdsTouchingNodes(edges, nodeIds, edgeLimit),
    activeNodeId: items[0].id,
    activeCommunityName: null,
    count: items.length,
    items: items.map((item) => ({
      kind: 'node',
      id: item.id,
      label: item.label,
      detail: item.timestamp ? new Date(item.timestamp).toISOString().slice(0, 10) : 'recent'
    }))
  };
}

function rankedNodesByDegree(nodes, degreeByNode) {
  return nodes
    .map((node) => {
      const id = String(node?.id ?? '');
      return {
        id,
        label: labelForNode(node, id),
        degree: degreeForNode(id, degreeByNode)
      };
    })
    .filter((item) => item.id)
    .sort((left, right) => right.degree - left.degree || left.label.localeCompare(right.label));
}

function edgeIdsTouchingNodes(edges, nodeIds, limit) {
  return edges
    .map((edge) => ({
      id: String(edge.id ?? `${endpointId(edge.source ?? edge.from)}-${endpointId(edge.target ?? edge.to)}`),
      source: endpointId(edge.source ?? edge.from),
      target: endpointId(edge.target ?? edge.to)
    }))
    .filter((edge) => nodeIds.has(edge.source) || nodeIds.has(edge.target))
    .slice(0, limit)
    .reduce((set, edge) => set.add(edge.id), new Set());
}

function buildAdjacency(nodeIds, edges) {
  const adjacency = new Map(Array.from(nodeIds).map((id) => [id, new Set()]));
  edges.forEach((edge) => {
    const source = endpointId(edge.source ?? edge.from);
    const target = endpointId(edge.target ?? edge.to);
    if (!adjacency.has(source) || !adjacency.has(target)) {
      return;
    }
    adjacency.get(source).add(target);
    adjacency.get(target).add(source);
  });
  return adjacency;
}

function disconnectedComponents(nodeIds, adjacency) {
  const visited = new Set();
  const components = [];
  nodeIds.forEach((start) => {
    if (visited.has(start)) {
      return;
    }
    const component = [];
    const stack = [start];
    visited.add(start);
    while (stack.length) {
      const current = stack.pop();
      component.push(current);
      (adjacency.get(current) || new Set()).forEach((next) => {
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
      });
    }
    components.push(component.sort());
  });

  const largestSize = Math.max(0, ...components.map((component) => component.length));
  return components
    .filter((component) => component.length < largestSize || largestSize <= 3)
    .sort((left, right) => left.length - right.length || left[0].localeCompare(right[0]));
}

function communityCountMap(nodes) {
  const counts = new Map();
  nodes.forEach((node) => {
    const community = String(node?.community || '');
    if (community) {
      counts.set(community, (counts.get(community) ?? 0) + 1);
    }
  });
  return counts;
}

function uniqueById() {
  const seen = new Set();
  return (item) => {
    if (!item.id || seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  };
}

function degreeForNode(nodeId, degreeByNode) {
  if (!nodeId) {
    return 0;
  }
  if (degreeByNode instanceof Map) {
    return degreeByNode.get(String(nodeId)) ?? degreeByNode.get(nodeId) ?? 0;
  }
  return Number(degreeByNode[String(nodeId)] || 0);
}

function endpointId(value) {
  if (value && typeof value === 'object') {
    return String(value.id ?? value.label ?? value.name ?? '');
  }
  return String(value ?? '');
}

function labelForNode(node, fallback = 'Untitled') {
  return String(node?.label || node?.title || node?.name || node?.id || fallback || 'Untitled');
}
