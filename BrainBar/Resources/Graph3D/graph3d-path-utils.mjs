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
