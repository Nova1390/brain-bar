export const projectedGridCellSize = 72;

export function activeModeFromState(state = {}) {
  if (state.pathMode) {
    return 'path';
  }
  if (state.focusMode) {
    return 'focus';
  }
  if (state.communitySpotlightName) {
    return 'community';
  }
  if (state.recentOrbitMode) {
    return 'recent';
  }
  if (state.graphStoryMode) {
    return 'story';
  }
  if (state.searchRevealNodeId) {
    return 'search';
  }
  return 'none';
}

export function labelBudgetForMode(mode, { hasSelected = false, hasHover = false } = {}) {
  if (mode === 'path' || mode === 'focus' || mode === 'search') {
    return 14;
  }
  if (mode === 'community' || mode === 'recent') {
    return 12;
  }
  if (mode === 'story') {
    return 8;
  }
  if (hasSelected) {
    return 12;
  }
  if (hasHover) {
    return 8;
  }
  return 0;
}

export function spotlightBudgets(nodeCount, options = {}) {
  const count = Math.max(0, Number(nodeCount) || 0);
  const largeThreshold = options.largeThreshold ?? 80;
  if (count > largeThreshold) {
    return {
      focusNodeLimit: options.largeFocusNodeLimit ?? 40,
      internalEdgeLimit: options.largeInternalEdgeLimit ?? 100,
      bridgeEdgeLimit: options.largeBridgeEdgeLimit ?? 60,
      useAllNodes: false
    };
  }
  return {
    focusNodeLimit: Math.max(count, options.smallFocusNodeLimit ?? 80),
    internalEdgeLimit: options.smallInternalEdgeLimit ?? 180,
    bridgeEdgeLimit: options.smallBridgeEdgeLimit ?? 80,
    useAllNodes: true
  };
}

export function buildProjectedNodeGrid(projectedPoints, { cellSize = projectedGridCellSize } = {}) {
  const normalizedCellSize = Math.max(12, Number(cellSize) || projectedGridCellSize);
  const cells = new Map();
  const points = projectedPoints instanceof Map ? projectedPoints : new Map();
  points.forEach((point, nodeId) => {
    const cellX = Math.floor(point.x / normalizedCellSize);
    const cellY = Math.floor(point.y / normalizedCellSize);
    const key = `${cellX}:${cellY}`;
    const ids = cells.get(key) ?? [];
    ids.push(nodeId);
    cells.set(key, ids);
  });
  return {
    cellSize: normalizedCellSize,
    cells,
    totalNodes: points.size
  };
}

export function nearbyProjectedNodeIds(grid, point, radius) {
  if (!grid?.cells || !point) {
    return [];
  }
  const normalizedRadius = Math.max(1, Number(radius) || 1);
  const cellSize = Math.max(1, grid.cellSize || projectedGridCellSize);
  const minX = Math.floor((point.x - normalizedRadius) / cellSize);
  const maxX = Math.floor((point.x + normalizedRadius) / cellSize);
  const minY = Math.floor((point.y - normalizedRadius) / cellSize);
  const maxY = Math.floor((point.y + normalizedRadius) / cellSize);
  const ids = [];
  for (let cellX = minX; cellX <= maxX; cellX += 1) {
    for (let cellY = minY; cellY <= maxY; cellY += 1) {
      const bucket = grid.cells.get(`${cellX}:${cellY}`);
      if (bucket) {
        ids.push(...bucket);
      }
    }
  }
  return ids;
}
