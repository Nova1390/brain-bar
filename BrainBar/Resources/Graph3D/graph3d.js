const canvas = document.getElementById('graph-canvas');
const context = canvas.getContext('2d', { alpha: true });
const stage = document.getElementById('stage');
const overlay = document.getElementById('overlay');
const search = document.getElementById('search');
const searchResults = document.getElementById('search-results');
const nodeInfo = document.getElementById('node-info');
const legend = document.getElementById('legend');
const stats = document.getElementById('stats');
const hud = document.getElementById('hud');

const palette = [
  '#5b8cc5', '#ff9f2d', '#ef5f61', '#7bc8c1', '#5fb156', '#f2d34b',
  '#bd82b3', '#ff9aaa', '#a6846b', '#c8c3bd', '#4f79ad', '#f28d25',
  '#d96068', '#84cbc4', '#62ad59', '#edcf45', '#b67eaa', '#f498a5'
];

const state = {
  graph: null,
  lens: 'all',
  communities: [],
  communityEnabled: new Set(),
  visibleNodes: [],
  visibleEdges: [],
  positions: new Map(),
  projected: new Map(),
  selectedNode: null,
  hoveredNode: null,
  animationFrame: null,
  pixelRatio: 1,
  width: 1,
  height: 1,
  lastDiagnostic: '',
  cameraPreset: 'Fit',
  camera: {
    yaw: -0.54,
    tilt: 0.58,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    panX: 0,
    panY: 0
  },
  drag: null
};

function isBrainBarWebKitScheme() {
  return window.location.protocol === 'brainbar3d:';
}

function normalizeGraph(payload) {
  if (!payload) {
    return { nodes: [], edges: [] };
  }

  const rawNodes = Array.isArray(payload.nodes) ? payload.nodes : [];
  const rawEdges = Array.isArray(payload.links) ? payload.links : (Array.isArray(payload.edges) ? payload.edges : []);
  const nodes = rawNodes.map((node, index) => {
    const id = String(node.id ?? node.label ?? node.name ?? index);
    const community = node.community_name ?? node.community ?? node.group ?? node.cluster ?? 'Community 0';
    return {
      ...node,
      id,
      label: String(node.label ?? node.name ?? id),
      community: String(community).startsWith('Community') ? String(community) : `Community ${community}`,
      sourceFile: node.source_file ?? node._source_file ?? node.sourceFile ?? ''
    };
  });

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = rawEdges.map((edge, index) => {
    const source = endpointId(edge.source ?? edge.from);
    const target = endpointId(edge.target ?? edge.to);
    return {
      ...edge,
      id: String(edge.id ?? `${source}-${target}-${index}`),
      source,
      target,
      relation: String(edge.relation ?? edge.context ?? edge.type ?? '')
    };
  }).filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));

  return { nodes, edges };
}

function endpointId(value) {
  if (value && typeof value === 'object') {
    return String(value.id ?? value.label ?? value.name ?? '');
  }
  return String(value ?? '');
}

function prepareCommunities(graph) {
  const counts = new Map();
  graph.nodes.forEach((node) => {
    counts.set(node.community, (counts.get(node.community) ?? 0) + 1);
  });
  state.communities = Array.from(counts.entries())
    .map(([name, count], index) => ({ name, count, color: palette[index % palette.length], index }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
  state.communityEnabled = new Set(state.communities.map((community) => community.name));
}

function applyLens(fit = true) {
  try {
    const graph = state.graph ?? { nodes: [], edges: [] };
    let lensEdges = graph.edges;
    if (state.lens === 'obsidian') {
      lensEdges = graph.edges.filter(isObsidianEdge);
    } else if (state.lens === 'graphify') {
      lensEdges = graph.edges.filter((edge) => !isObsidianEdge(edge));
    }

    const connectedIds = new Set();
    lensEdges.forEach((edge) => {
      connectedIds.add(edge.source);
      connectedIds.add(edge.target);
    });

    const lensNodes = state.lens === 'all'
      ? graph.nodes
      : graph.nodes.filter((node) => connectedIds.has(node.id));

    state.visibleNodes = lensNodes.filter((node) => state.communityEnabled.has(node.community));
    const visibleIds = new Set(state.visibleNodes.map((node) => node.id));
    state.visibleEdges = lensEdges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));

    calculateLayout();
    if (fit) {
      fitCameraToGraph('Fit');
    }
    renderSidebar();
    updateOverlay();
    state.lastDiagnostic = '';
    updateHud();
    requestDraw();
  } catch (error) {
    reportDiagnostic(error.message || '3D graph render failed', true);
  }
}

function isObsidianEdge(edge) {
  const values = [edge.context, edge.relation, edge.label, edge.title]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  return values.some((value) => value === 'obsidian_wikilink' || value.includes('obsidian_wikilink'));
}

function calculateLayout() {
  state.positions = new Map();
  const communityIndex = new Map(state.communities.map((community, index) => [community.name, index]));
  const communityCount = Math.max(state.communities.length, 1);
  const clusterRadius = Math.min(640, 150 + Math.sqrt(communityCount) * 70);
  const nodesByCommunity = new Map();
  const degreeMap = buildDegreeMap(state.visibleEdges);

  state.visibleNodes.forEach((node) => {
    const nodes = nodesByCommunity.get(node.community) ?? [];
    nodes.push(node);
    nodesByCommunity.set(node.community, nodes);
  });

  nodesByCommunity.forEach((nodes, communityName) => {
    const index = communityIndex.get(communityName) ?? 0;
    const center = pointOnDisc(index, communityCount, clusterRadius);
    const localRadius = Math.max(26, Math.min(132, Math.sqrt(nodes.length) * 9));
    nodes.forEach((node, localIndex) => {
      const seed = hashString(node.id);
      const angle = localIndex * 2.399963 + (seed % 100) * 0.01;
      const distance = localRadius * Math.sqrt((localIndex + 0.5) / Math.max(nodes.length, 1));
      const z = depthForNode(node, index, localIndex, degreeMap);
      state.positions.set(node.id, {
        x: center.x + Math.cos(angle) * distance,
        y: center.y + Math.sin(angle) * distance,
        z
      });
    });
  });

  relaxLayout(nodesByCommunity);
}

function buildDegreeMap(edges) {
  const degreeMap = new Map();
  edges.forEach((edge) => {
    degreeMap.set(edge.source, (degreeMap.get(edge.source) ?? 0) + 1);
    degreeMap.set(edge.target, (degreeMap.get(edge.target) ?? 0) + 1);
  });
  return degreeMap;
}

function depthForNode(node, communityIndex, localIndex, degreeMap) {
  const seed = hashString(`${node.id}:${node.community}`);
  const degree = degreeMap.get(node.id) ?? 0;
  const hubLift = Math.min(54, Math.log1p(degree) * 11);
  const communityBand = ((communityIndex % 11) - 5) * 8;
  const localWave = Math.sin((localIndex + 1) * 1.618 + (seed % 97)) * 15;
  return clamp(communityBand + hubLift + localWave, -110, 130);
}

function relaxLayout(nodesByCommunity) {
  const visibleIds = new Set(state.visibleNodes.map((node) => node.id));
  const iterations = Math.min(36, Math.max(14, Math.floor(state.visibleEdges.length / 38)));
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    state.visibleEdges.forEach((edge) => {
      if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) {
        return;
      }
      const source = state.positions.get(edge.source);
      const target = state.positions.get(edge.target);
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const length = Math.max(Math.hypot(dx, dy), 0.001);
      const force = (length - 52) * 0.0036;
      const ox = (dx / length) * force;
      const oy = (dy / length) * force;
      source.x += ox;
      source.y += oy;
      target.x -= ox;
      target.y -= oy;
    });

    if (iteration % 5 === 0) {
      separateLocalNodes(nodesByCommunity);
    }
  }
}

function separateLocalNodes(nodesByCommunity) {
  const minDistance = 9.5;
  nodesByCommunity.forEach((nodes) => {
    for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
      const left = state.positions.get(nodes[leftIndex].id);
      for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
        const right = state.positions.get(nodes[rightIndex].id);
        const dx = right.x - left.x;
        const dy = right.y - left.y;
        const distance = Math.max(Math.hypot(dx, dy), 0.001);
        if (distance >= minDistance) {
          continue;
        }
        const push = (minDistance - distance) * 0.3;
        const ox = dx === 0 && dy === 0 ? push : (dx / distance) * push;
        const oy = dx === 0 && dy === 0 ? 0 : (dy / distance) * push;
        left.x -= ox;
        left.y -= oy;
        right.x += ox;
        right.y += oy;
      }
    }
  });
}

function pointOnDisc(index, count, radius) {
  if (count <= 1) {
    return { x: 0, y: 0 };
  }
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const localRadius = Math.sqrt((index + 0.5) / count) * radius;
  const angle = index * goldenAngle;
  return {
    x: Math.cos(angle) * localRadius,
    y: Math.sin(angle) * localRadius
  };
}

function projectPoint(position) {
  const raw = projectRawPoint(position);
  return {
    x: state.width / 2 + (raw.x - state.camera.offsetX) * state.camera.zoom + state.camera.panX,
    y: state.height / 2 + (raw.y - state.camera.offsetY) * state.camera.zoom + state.camera.panY,
    depth: raw.depth
  };
}

function projectRawPoint(position) {
  const { yaw, tilt } = state.camera;
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosTilt = Math.cos(tilt);
  const sinTilt = Math.sin(tilt);
  const rx = position.x * cosYaw - position.y * sinYaw;
  const ry = position.x * sinYaw + position.y * cosYaw;
  const px = rx;
  const py = ry * cosTilt - position.z * sinTilt;
  const depth = ry * sinTilt + position.z * cosTilt;
  return {
    x: px,
    y: py,
    depth
  };
}

function updateProjectionCache() {
  state.projected = new Map();
  state.visibleNodes.forEach((node) => {
    const position = state.positions.get(node.id);
    if (position) {
      state.projected.set(node.id, { ...projectPoint(position), node });
    }
  });
}

function projectedBounds() {
  const points = [];
  state.positions.forEach((position) => {
    points.push(projectRawPoint(position));
  });
  if (!points.length) {
    return null;
  }
  return points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y)
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

function fitCameraToGraph(preset = 'Fit') {
  state.camera.panX = 0;
  state.camera.panY = 0;
  state.camera.offsetX = 0;
  state.camera.offsetY = 0;
  state.camera.zoom = 1;
  const bounds = projectedBounds();
  if (!bounds) {
    state.camera.zoom = 1;
    state.cameraPreset = preset;
    requestDraw();
    return;
  }

  const graphWidth = Math.max(bounds.maxX - bounds.minX, 120);
  const graphHeight = Math.max(bounds.maxY - bounds.minY, 120);
  const zoomX = state.width / (graphWidth * 1.16);
  const zoomY = state.height / (graphHeight * 1.16);
  state.camera.offsetX = (bounds.minX + bounds.maxX) / 2;
  state.camera.offsetY = (bounds.minY + bounds.maxY) / 2;
  state.camera.zoom = clamp(Math.min(zoomX, zoomY), 0.08, 2.8);
  state.cameraPreset = preset;
  updateHud();
  requestDraw();
}

function drawGraph() {
  context.clearRect(0, 0, state.width, state.height);
  if (!state.visibleNodes.length || !state.positions.size) {
    return;
  }

  updateProjectionCache();

  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';

  state.visibleEdges.forEach((edge) => {
    const source = state.projected.get(edge.source);
    const target = state.projected.get(edge.target);
    if (!source || !target) {
      return;
    }
    const alpha = 0.18 + clamp((source.depth + target.depth) / 900, -0.05, 0.10);
    context.beginPath();
    context.moveTo(source.x, source.y);
    context.lineTo(target.x, target.y);
    context.strokeStyle = `rgba(145, 162, 207, ${alpha})`;
    context.lineWidth = 0.85;
    context.stroke();
  });

  Array.from(state.projected.values())
    .sort((left, right) => left.depth - right.depth)
    .forEach((item) => {
      const color = colorForCommunity(item.node.community);
      const radius = clamp(3.2 + item.depth / 150, 2.4, 6.2);
      const haloRadius = radius * 2.7;
      const gradient = context.createRadialGradient(item.x, item.y, 0, item.x, item.y, haloRadius);
      gradient.addColorStop(0, color);
      gradient.addColorStop(0.58, colorWithAlpha(color, 0.7));
      gradient.addColorStop(1, colorWithAlpha(color, 0));
      context.fillStyle = gradient;
      context.globalAlpha = 0.95;
      context.beginPath();
      context.arc(item.x, item.y, haloRadius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = color;
      context.globalAlpha = 0.98;
      context.beginPath();
      context.arc(item.x, item.y, radius, 0, Math.PI * 2);
      context.fill();
    });

  if (state.selectedNode) {
    const selected = state.projected.get(state.selectedNode.id);
    if (selected) {
      context.globalAlpha = 1;
      context.beginPath();
      context.arc(selected.x, selected.y, 10, 0, Math.PI * 2);
      context.strokeStyle = 'rgba(244, 246, 255, 0.9)';
      context.lineWidth = 2;
      context.stroke();
    }
  }

  context.restore();
}

function requestDraw() {
  if (state.animationFrame) {
    return;
  }
  state.animationFrame = requestAnimationFrame(() => {
    state.animationFrame = null;
    drawGraph();
  });
}

function resize() {
  const rect = stage.getBoundingClientRect();
  const width = Math.max(Math.floor(rect.width), 1);
  const height = Math.max(Math.floor(rect.height), 1);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  state.width = width;
  state.height = height;
  state.pixelRatio = pixelRatio;
  canvas.width = Math.max(Math.floor(width * pixelRatio), 1);
  canvas.height = Math.max(Math.floor(height * pixelRatio), 1);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  if (state.graph) {
    fitCameraToGraph(state.cameraPreset || 'Fit');
  } else {
    requestDraw();
  }
}

function renderSidebar() {
  renderNodeInfo(state.selectedNode);
  renderLegend();
  renderStats();
  renderSearchResults();
}

function renderNodeInfo(node) {
  if (!node) {
    nodeInfo.innerHTML = '<p class="muted italic">Click a node to inspect it</p>';
    return;
  }

  const source = node.sourceFile || '';
  const sourceButton = source
    ? '<button class="primary-button" id="open-note">Open Note</button>'
    : '';
  nodeInfo.innerHTML = `
    <h3>${escapeHTML(node.label)}</h3>
    ${sourceButton}
    <p><strong>Type:</strong> ${escapeHTML(node.type ?? node.file_type ?? 'document')}</p>
    <p><strong>Community:</strong> ${escapeHTML(node.community)}</p>
    ${source ? `<p><strong>Source:</strong> ${escapeHTML(source)}</p>` : ''}
    <p><strong>Degree:</strong> ${degreeForNode(node.id)}</p>
  `;

  const button = document.getElementById('open-note');
  if (button) {
    button.addEventListener('click', () => sendNodeAction('openNode', node));
  }
}

function renderLegend() {
  legend.innerHTML = '';
  state.communities.forEach((community) => {
    const row = document.createElement('label');
    row.className = 'legend-item';
    row.innerHTML = `
      <input type="checkbox" ${state.communityEnabled.has(community.name) ? 'checked' : ''}>
      <span class="legend-label"><span class="color-dot" style="background:${community.color}"></span> ${escapeHTML(community.name)}</span>
      <span class="legend-count">${community.count}</span>
    `;
    row.querySelector('input').addEventListener('change', (event) => {
      if (event.target.checked) {
        state.communityEnabled.add(community.name);
      } else {
        state.communityEnabled.delete(community.name);
      }
      applyLens(false);
    });
    legend.appendChild(row);
  });
}

function renderStats() {
  const visibleCommunityCount = new Set(state.visibleNodes.map((node) => node.community)).size;
  stats.textContent = `${state.visibleNodes.length} nodes · ${state.visibleEdges.length} edges · ${visibleCommunityCount} communities`;
}

function renderSearchResults() {
  const query = search.value.trim().toLowerCase();
  searchResults.innerHTML = '';
  if (!query) {
    return;
  }
  state.visibleNodes
    .filter((node) => node.label.toLowerCase().includes(query))
    .slice(0, 8)
    .forEach((node) => {
      const button = document.createElement('button');
      button.className = 'search-item';
      button.textContent = node.label;
      button.addEventListener('click', () => selectNode(node, true));
      searchResults.appendChild(button);
    });
}

function updateOverlay() {
  if (!state.graph || state.graph.nodes.length === 0) {
    showOverlay('Graph data unavailable');
  } else if (state.lens === 'obsidian' && state.visibleEdges.length === 0) {
    showOverlay('No Obsidian links found');
  } else if (state.lens === 'graphify' && state.visibleEdges.length === 0) {
    showOverlay('No Graphify edges found');
  } else if (state.visibleNodes.length === 0) {
    showOverlay('No visible nodes');
  } else {
    overlay.hidden = true;
  }
}

function showOverlay(message) {
  overlay.textContent = message;
  overlay.hidden = false;
}

function updateHud() {
  if (!hud) {
    return;
  }
  if (!state.graph) {
    hud.hidden = true;
    return;
  }
  const lensLabel = state.lens === 'all'
    ? 'All'
    : (state.lens === 'graphify' ? 'Graphify' : 'Obsidian');
  const base = `${state.visibleNodes.length} nodes · ${state.visibleEdges.length} edges · ${lensLabel} · ${state.cameraPreset}`;
  hud.textContent = state.lastDiagnostic ? `${base} · ${state.lastDiagnostic}` : base;
  hud.hidden = false;
}

function selectNode(node, focusCamera = false) {
  state.selectedNode = node;
  renderNodeInfo(node);
  if (focusCamera) {
    focusNode(node);
  }
  requestDraw();
}

function focusNode(node) {
  const point = state.projected.get(node.id);
  if (!point) {
    return;
  }
  state.camera.panX += state.width / 2 - point.x;
  state.camera.panY += state.height / 2 - point.y;
  state.camera.zoom = clamp(Math.max(state.camera.zoom, 1.5), 0.08, 5);
  state.cameraPreset = 'Node focus';
  updateHud();
  requestDraw();
}

function nodeAtEvent(event) {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  updateProjectionCache();
  let best = null;
  let bestDistance = Infinity;
  state.projected.forEach((item) => {
    const radius = clamp(8 + item.depth / 120, 6, 16);
    const distance = Math.hypot(item.x - x, item.y - y);
    if (distance < radius && distance < bestDistance) {
      best = item.node;
      bestDistance = distance;
    }
  });
  return best;
}

function resetCamera() {
  fitCameraToGraph('Fit');
}

function zoomCamera(multiplier) {
  state.camera.zoom = clamp(state.camera.zoom * multiplier, 0.08, 5);
  state.cameraPreset = multiplier > 1 ? 'Zoom in' : 'Zoom out';
  updateHud();
  requestDraw();
}

function topView() {
  state.camera.yaw = 0;
  state.camera.tilt = 0;
  fitCameraToGraph('Top view');
}

function resetTilt() {
  state.camera.yaw = -0.54;
  state.camera.tilt = 0.58;
  fitCameraToGraph('Reset tilt');
}

function degreeForNode(nodeId) {
  return state.visibleEdges.filter((edge) => edge.source === nodeId || edge.target === nodeId).length;
}

function colorForCommunity(name) {
  const community = state.communities.find((item) => item.name === name);
  return community?.color ?? palette[0];
}

function colorWithAlpha(hex, alpha) {
  const color = hex.replace('#', '');
  const value = parseInt(color, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function reportDiagnostic(message, showsOverlay = false) {
  const text = String(message || '3D renderer failed');
  if (text.startsWith('Graph data unavailable') && state.graph) {
    return;
  }
  state.lastDiagnostic = text;
  updateHud();
  if (showsOverlay) {
    showOverlay(text);
  }
  if (window.webkit?.messageHandlers?.brainBarGraphDiagnostic) {
    window.webkit.messageHandlers.brainBarGraphDiagnostic.postMessage({
      message: text,
      lens: state.lens,
      nodes: state.visibleNodes.length,
      edges: state.visibleEdges.length,
      cameraPreset: state.cameraPreset
    });
  }
}

function sendNodeAction(action, node) {
  if (!node || !window.webkit?.messageHandlers?.brainBarNodeAction) {
    return;
  }
  window.webkit.messageHandlers.brainBarNodeAction.postMessage({
    action,
    nodeId: node.id,
    label: node.label,
    sourceFile: node.sourceFile || ''
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

window.brainBarLoadGraph = (payload, lens = 'all') => {
  try {
    state.graph = normalizeGraph(payload);
    state.lens = lens;
    state.selectedNode = null;
    prepareCommunities(state.graph);
    applyLens(true);
  } catch (error) {
    reportDiagnostic(error.message || '3D graph data could not be loaded', true);
  }
};

window.brainBarApplyGraphLens = (lens) => {
  state.lens = lens;
  state.selectedNode = null;
  applyLens(true);
};

window.brainBarResetCamera = resetCamera;
window.brainBarZoom = zoomCamera;
window.brainBarTopView = topView;
window.brainBarResetTilt = resetTilt;
window.brainBarRendererDiagnostics = () => ({
  nodes: state.visibleNodes.length,
  edges: state.visibleEdges.length,
  lens: state.lens,
  communities: state.communities.length,
  cameraPreset: state.cameraPreset,
  cameraZoom: state.camera.zoom,
  canvasWidth: canvas.width,
  canvasHeight: canvas.height,
  stageWidth: state.width,
  stageHeight: state.height,
  diagnostic: state.lastDiagnostic
});

canvas.addEventListener('mousedown', (event) => {
  state.drag = {
    x: event.clientX,
    y: event.clientY,
    panX: state.camera.panX,
    panY: state.camera.panY,
    moved: false
  };
});

window.addEventListener('mousemove', (event) => {
  if (!state.drag) {
    const node = nodeAtEvent(event);
    if (node !== state.hoveredNode) {
      state.hoveredNode = node;
      canvas.style.cursor = node ? 'pointer' : 'grab';
    }
    return;
  }
  const dx = event.clientX - state.drag.x;
  const dy = event.clientY - state.drag.y;
  state.drag.moved = state.drag.moved || Math.hypot(dx, dy) > 3;
  state.camera.panX = state.drag.panX + dx;
  state.camera.panY = state.drag.panY + dy;
  state.cameraPreset = 'Manual';
  updateHud();
  requestDraw();
});

window.addEventListener('mouseup', (event) => {
  if (!state.drag) {
    return;
  }
  const moved = state.drag.moved;
  state.drag = null;
  canvas.style.cursor = 'grab';
  if (!moved) {
    const node = nodeAtEvent(event);
    if (node) {
      selectNode(node);
    }
  }
});

canvas.addEventListener('dblclick', (event) => {
  const node = nodeAtEvent(event);
  if (node) {
    sendNodeAction('openNode', node);
  }
});

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  zoomCamera(event.deltaY < 0 ? 1.12 : 0.9);
}, { passive: false });

search.addEventListener('input', renderSearchResults);
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(stage);

window.addEventListener('error', (event) => {
  reportDiagnostic(event.message || '3D renderer failed', true);
});

window.addEventListener('unhandledrejection', (event) => {
  reportDiagnostic(event.reason?.message || '3D renderer failed', true);
});

resize();

if (window.__brainBarGraphJSON) {
  window.brainBarLoadGraph(window.__brainBarGraphJSON, window.__brainBarPendingGraphLens || 'all');
} else if (!isBrainBarWebKitScheme()) {
  fetch('./graph.json')
    .then((response) => {
      if (!response.ok && response.status !== 0) {
        throw new Error(`Graph data unavailable (${response.status})`);
      }
      return response.json();
    })
    .then((payload) => {
      window.__brainBarGraphJSON = payload;
      window.brainBarLoadGraph(payload, window.__brainBarPendingGraphLens || 'all');
    })
    .catch((error) => {
      reportDiagnostic(error.message || 'Graph data unavailable', true);
    });
} else {
  updateHud();
}
