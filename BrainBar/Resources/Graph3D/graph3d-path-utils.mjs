export function computeShortestPath({ sourceId, targetId, nodes = [], edges = [] }) {
  const source = String(sourceId ?? '');
  const target = String(targetId ?? '');
  const visibleNodeIds = new Set(nodes.map((node) => String(node.id)));

  if (!source || !target || !visibleNodeIds.has(source) || !visibleNodeIds.has(target)) {
    return emptyPath('No visible path in current view');
  }
  if (source === target) {
    return {
      found: true,
      message: '',
      orderedNodeIds: [source],
      orderedEdgeIds: [],
      nodeIds: new Set([source]),
      edgeIds: new Set()
    };
  }

  const adjacency = new Map();
  edges.forEach((edge) => {
    const edgeId = String(edge.id ?? `${edge.source}:${edge.target}`);
    const from = endpointId(edge.source ?? edge.from);
    const to = endpointId(edge.target ?? edge.to);
    if (!visibleNodeIds.has(from) || !visibleNodeIds.has(to)) {
      return;
    }
    if (!adjacency.has(from)) {
      adjacency.set(from, []);
    }
    if (!adjacency.has(to)) {
      adjacency.set(to, []);
    }
    adjacency.get(from).push({ nodeId: to, edgeId });
    adjacency.get(to).push({ nodeId: from, edgeId });
  });

  const queue = [source];
  const visited = new Set([source]);
  const previous = new Map();
  let cursor = 0;

  while (cursor < queue.length) {
    const current = queue[cursor];
    cursor += 1;
    const neighbors = adjacency.get(current) || [];
    for (const neighbor of neighbors) {
      if (visited.has(neighbor.nodeId)) {
        continue;
      }
      visited.add(neighbor.nodeId);
      previous.set(neighbor.nodeId, { nodeId: current, edgeId: neighbor.edgeId });
      if (neighbor.nodeId === target) {
        return buildPath(source, target, previous);
      }
      queue.push(neighbor.nodeId);
    }
  }

  return emptyPath('No visible path in current view');
}

export function explainShortestPath({
  orderedNodeIds = [],
  orderedEdgeIds = [],
  nodes = [],
  edges = [],
  lens = 'all',
  degreeByNode = new Map()
} = {}) {
  if (!orderedNodeIds.length || !orderedEdgeIds.length) {
    return null;
  }

  const nodeById = new Map(nodes.map((node) => [String(node.id), node]));
  const edgeById = new Map(edges.map((edge) => [String(edge.id ?? `${endpointId(edge.source ?? edge.from)}:${endpointId(edge.target ?? edge.to)}`), edge]));
  const pathEdges = orderedEdgeIds.map((edgeId) => edgeById.get(String(edgeId))).filter(Boolean);
  if (!pathEdges.length) {
    return null;
  }

  const counts = { wikilink: 0, graphify: 0, unknown: 0 };
  const relationshipLabels = [];
  pathEdges.forEach((edge) => {
    const provenance = edgeProvenance(edge);
    counts[provenance] += 1;
    const label = relationshipLabel(edge);
    if (label) {
      relationshipLabels.push(label);
    }
  });

  const pathNodes = orderedNodeIds.map((nodeId) => nodeById.get(String(nodeId))).filter(Boolean);
  const communities = new Set(pathNodes.map((node) => String(node.community || '')).filter(Boolean));
  const badges = relationshipBadges(counts);
  if (communities.size > 1) {
    badges.push(`${communities.size} communities`);
  }

  const bridgeNode = bridgeNodeForPath(orderedNodeIds, nodeById, edges, degreeByNode);
  const bullets = [];
  if (communities.size > 1) {
    bullets.push(`The path crosses ${communities.size} communities, so it is connecting separate parts of the graph.`);
  }
  if (bridgeNode) {
    bullets.push(`${nodeLabel(bridgeNode)} is the strongest bridge in this route by visible degree.`);
  }
  const labelSummary = [...new Set(relationshipLabels)].slice(0, 2);
  if (labelSummary.length) {
    bullets.push(`The visible connection labels include ${labelSummary.join(' and ')}.`);
  }
  if (lens === 'obsidian') {
    bullets.push('This explanation only uses relationships visible in the Wikilinks lens.');
  } else if (lens === 'graphify') {
    bullets.push('This explanation only uses relationships visible in the Graphify lens.');
  }

  return {
    title: 'Why this path',
    summary: pathSummary(counts),
    badges,
    bullets: bullets.slice(0, 4),
    caveat: counts.unknown > 0 || relationshipLabels.length === 0
      ? 'Some connection metadata is unavailable, so this explanation stays conservative.'
      : ''
  };
}

function buildPath(source, target, previous) {
  const orderedNodeIds = [target];
  const orderedEdgeIds = [];
  let current = target;

  while (current !== source) {
    const step = previous.get(current);
    if (!step) {
      return emptyPath('No visible path in current view');
    }
    orderedEdgeIds.unshift(step.edgeId);
    orderedNodeIds.unshift(step.nodeId);
    current = step.nodeId;
  }

  return {
    found: true,
    message: '',
    orderedNodeIds,
    orderedEdgeIds,
    nodeIds: new Set(orderedNodeIds),
    edgeIds: new Set(orderedEdgeIds)
  };
}

function emptyPath(message) {
  return {
    found: false,
    message,
    orderedNodeIds: [],
    orderedEdgeIds: [],
    nodeIds: new Set(),
    edgeIds: new Set()
  };
}

function endpointId(value) {
  if (value && typeof value === 'object') {
    return String(value.id ?? value.label ?? value.name ?? '');
  }
  return String(value ?? '');
}

function edgeProvenance(edge) {
  if (isWikilinkEdge(edge)) {
    return 'wikilink';
  }
  return hasEdgeMetadata(edge) ? 'graphify' : 'unknown';
}

function isWikilinkEdge(edge) {
  return edgeValues(edge).some((value) => value === 'obsidian_wikilink' || value.includes('obsidian_wikilink'));
}

function hasEdgeMetadata(edge) {
  return edgeValues(edge).some(Boolean);
}

function edgeValues(edge) {
  return [edge?.context, edge?.relation, edge?.label, edge?.title, edge?.type]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
}

function relationshipLabel(edge) {
  const value = edge?.relation || edge?.context || edge?.label || edge?.title || edge?.type || '';
  const label = String(value)
    .replace(/\s*\[[^\]]*EXTRACTED[^\]]*\]\s*/gi, ' ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!label || /^contains$/i.test(label)) {
    return '';
  }
  if (/^obsidian wikilink$/i.test(label)) {
    return 'Wikilink';
  }
  return label.length > 48 ? `${label.slice(0, 45)}...` : label;
}

function relationshipBadges(counts) {
  return [
    countBadge(counts.wikilink, 'Wikilink', 'Wikilinks'),
    countBadge(counts.graphify, 'Graphify', 'Graphify'),
    countBadge(counts.unknown, 'Unknown', 'Unknown')
  ].filter(Boolean);
}

function countBadge(count, singular, plural) {
  if (!count) {
    return '';
  }
  return `${count} ${count === 1 ? singular : plural}`;
}

function pathSummary(counts) {
  if (counts.wikilink > 0 && counts.graphify === 0 && counts.unknown === 0) {
    return 'This route follows explicit wikilinks between notes.';
  }
  if (counts.graphify > 0 && counts.wikilink === 0 && counts.unknown === 0) {
    return 'This route is inferred from Graphify relationships in the visible graph.';
  }
  if (counts.wikilink > 0 && counts.graphify > 0) {
    return 'This route combines explicit wikilinks with inferred Graphify relationships.';
  }
  return 'BrainBar can trace this route, but the visible graph has limited connection metadata.';
}

function bridgeNodeForPath(orderedNodeIds, nodeById, edges, degreeByNode) {
  const intermediateIds = orderedNodeIds.slice(1, -1);
  if (!intermediateIds.length) {
    return null;
  }
  const derivedDegree = degreeMapFromEdges(edges);
  return intermediateIds
    .map((nodeId) => {
      const node = nodeById.get(String(nodeId));
      if (!node) {
        return null;
      }
      const degree = degreeValue(degreeByNode, node.id) ?? derivedDegree.get(String(node.id)) ?? 0;
      return { node, degree };
    })
    .filter(Boolean)
    .sort((left, right) => right.degree - left.degree || nodeLabel(left.node).localeCompare(nodeLabel(right.node)))[0]?.node || null;
}

function degreeMapFromEdges(edges) {
  const degree = new Map();
  edges.forEach((edge) => {
    const source = endpointId(edge.source ?? edge.from);
    const target = endpointId(edge.target ?? edge.to);
    degree.set(source, (degree.get(source) ?? 0) + 1);
    degree.set(target, (degree.get(target) ?? 0) + 1);
  });
  return degree;
}

function degreeValue(degreeByNode, nodeId) {
  if (!degreeByNode) {
    return null;
  }
  if (typeof degreeByNode.get === 'function') {
    return degreeByNode.get(String(nodeId)) ?? degreeByNode.get(nodeId) ?? null;
  }
  return degreeByNode[String(nodeId)] ?? null;
}

function nodeLabel(node) {
  return String(node?.label || node?.name || node?.id || 'This note');
}
