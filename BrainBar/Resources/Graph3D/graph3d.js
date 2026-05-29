import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';

const stage = document.getElementById('stage');
const graphVisual = document.getElementById('graph-visual');
const visualContext = graphVisual?.getContext('2d', { alpha: true });
const staticVisualLayer = document.createElement('canvas');
const staticVisualContext = staticVisualLayer.getContext('2d', { alpha: true });
const overlay = document.getElementById('overlay');
const search = document.getElementById('search');
const searchResults = document.getElementById('search-results');
const nodeInfo = document.getElementById('node-info');
const legend = document.getElementById('legend');
const stats = document.getElementById('stats');
const hud = document.getElementById('hud');

const palette = [
  '#6f89a9', '#b58a58', '#ad6970', '#70a4a0', '#78976c', '#b8a25d',
  '#9a7895', '#b7828b', '#927765', '#aaa6a0', '#657e9d', '#a97855',
  '#a7666d', '#76a29d', '#77916b', '#b09d5a', '#92748c', '#aa7d86'
];

const accentPalette = [
  '#8fb7df', '#f0a35a', '#dc747b', '#8fd1cb', '#8fc07e', '#dec56b',
  '#c995bf', '#f0a4af', '#bd987c', '#d4cec5', '#7fa2c8', '#df9555',
  '#cb737a', '#91d0ca', '#8abd7b', '#d7bd67', '#bd91b3', '#e79aa5'
];

const baseEdgeColor = '#6f7f9d';
const selectedStrokeColor = '#f1f4ff';
const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const ambientFrameInterval = 50;
const ambientMotionScale = prefersReducedMotion ? 0.45 : 1;
const ambientLocalAmplitude = 3.4 * ambientMotionScale;
const ambientBreathScale = 0.014 * ambientMotionScale;

const pointTexture = createPointTexture();

const state = {
  graph: null,
  lens: 'all',
  communities: [],
  communityEnabled: new Set(),
  visibleNodes: [],
  visibleEdges: [],
  positions: new Map(),
  degreeByNode: new Map(),
  adjacencyByNode: new Map(),
  edgesByNode: new Map(),
  projectedPoints: new Map(),
  visualCacheDirty: true,
  selectedNode: null,
  hoveredNode: null,
  hoverVisualNode: null,
  hoverTrails: new Map(),
  hoverIntensity: 0,
  lastDiagnostic: '',
  cameraPreset: 'Fit',
  lastFrameStatus: 'Waiting',
  visibleProjectedNodeCount: 0,
  pointer: new THREE.Vector2(),
  raycaster: new THREE.Raycaster(),
  nodeIndexById: new Map(),
  animationFrame: null,
  ambientFrame: null,
  ambientPhase: 0,
  lastAmbientTimestamp: 0
};

let renderer;
let scene;
let camera;
let controls;
let nodePoints;
let edgeLines;
let selectedMarker;

initScene();
wireEvents();
resize();
installWindowAPI();

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

function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#060912');

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor('#060912', 1);
  renderer.domElement.classList.add('webgl-hit-layer');
  stage.prepend(renderer.domElement);

  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10000);
  camera.position.set(0, 860, 520);
  camera.lookAt(0, 0, 0);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.enablePan = true;
  controls.enableZoom = true;
  controls.enableRotate = true;
  controls.minPolarAngle = 0.08;
  controls.maxPolarAngle = 1.08;
  controls.minZoom = 0.08;
  controls.maxZoom = 8;
  controls.screenSpacePanning = true;
  controls.target.set(0, 0, 0);
  controls.addEventListener('change', () => {
    state.cameraPreset = state.cameraPreset === 'Fit' ? 'Manual' : state.cameraPreset;
    markVisualCacheDirty();
    requestRender();
  });

  selectedMarker = new THREE.Mesh(
    new THREE.SphereGeometry(6, 18, 12),
    new THREE.MeshBasicMaterial({
      color: '#f4f6ff',
      transparent: true,
      opacity: 0.95,
      depthTest: false
    })
  );
  selectedMarker.visible = false;
  scene.add(selectedMarker);

  state.raycaster.params.Points.threshold = 14;
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
    .map(([name, count], index) => ({
      name,
      count,
      color: palette[index % palette.length],
      accentColor: accentPalette[index % accentPalette.length],
      index
    }))
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
    state.hoveredNode = null;
    state.hoverVisualNode = null;
    state.hoverTrails = new Map();
    state.hoverIntensity = 0;
    markVisualCacheDirty();

    calculateLayout();
    rebuildMeshes();
    if (fit) {
      fitCameraToGraph('Fit');
    }
    renderSidebar();
    updateOverlay();
    state.lastDiagnostic = '';
    updateHud();
    requestRender();
    startAmbientMotion();
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
  const clusterRadius = Math.min(760, 180 + Math.sqrt(communityCount) * 72);
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
    const localRadius = Math.max(30, Math.min(150, Math.sqrt(nodes.length) * 10));
    nodes.forEach((node, localIndex) => {
      const seed = hashString(node.id);
      const angle = localIndex * 2.399963 + (seed % 100) * 0.01;
      const distance = localRadius * Math.sqrt((localIndex + 0.5) / Math.max(nodes.length, 1));
      const depth = depthForNode(node, index, localIndex, degreeMap);
      state.positions.set(node.id, {
        x: center.x + Math.cos(angle) * distance,
        y: depth,
        z: center.y + Math.sin(angle) * distance
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

function buildAdjacencyMap(edges) {
  const adjacency = new Map();
  edges.forEach((edge) => {
    if (!adjacency.has(edge.source)) {
      adjacency.set(edge.source, new Set());
    }
    if (!adjacency.has(edge.target)) {
      adjacency.set(edge.target, new Set());
    }
    adjacency.get(edge.source).add(edge.target);
    adjacency.get(edge.target).add(edge.source);
  });
  return adjacency;
}

function buildEdgeMap(edges) {
  const edgeMap = new Map();
  edges.forEach((edge) => {
    if (!edgeMap.has(edge.source)) {
      edgeMap.set(edge.source, []);
    }
    if (!edgeMap.has(edge.target)) {
      edgeMap.set(edge.target, []);
    }
    edgeMap.get(edge.source).push(edge);
    edgeMap.get(edge.target).push(edge);
  });
  return edgeMap;
}

function depthForNode(node, communityIndex, localIndex, degreeMap) {
  const seed = hashString(`${node.id}:${node.community}`);
  const degree = degreeMap.get(node.id) ?? 0;
  const hubLift = Math.min(60, Math.log1p(degree) * 12);
  const communityBand = ((communityIndex % 13) - 6) * 7;
  const localWave = Math.sin((localIndex + 1) * 1.618 + (seed % 97)) * 16;
  return clamp(communityBand + hubLift + localWave, -120, 150);
}

function relaxLayout(nodesByCommunity) {
  const visibleIds = new Set(state.visibleNodes.map((node) => node.id));
  const iterations = Math.min(30, Math.max(12, Math.floor(state.visibleEdges.length / 60)));
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    state.visibleEdges.forEach((edge) => {
      if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) {
        return;
      }
      const source = state.positions.get(edge.source);
      const target = state.positions.get(edge.target);
      const dx = target.x - source.x;
      const dz = target.z - source.z;
      const length = Math.max(Math.hypot(dx, dz), 0.001);
      const force = (length - 58) * 0.003;
      const ox = (dx / length) * force;
      const oz = (dz / length) * force;
      source.x += ox;
      source.z += oz;
      target.x -= ox;
      target.z -= oz;
    });

    if (iteration % 5 === 0) {
      separateLocalNodes(nodesByCommunity);
    }
  }
}

function separateLocalNodes(nodesByCommunity) {
  const minDistance = 11;
  nodesByCommunity.forEach((nodes) => {
    for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
      const left = state.positions.get(nodes[leftIndex].id);
      for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
        const right = state.positions.get(nodes[rightIndex].id);
        const dx = right.x - left.x;
        const dz = right.z - left.z;
        const distance = Math.max(Math.hypot(dx, dz), 0.001);
        if (distance >= minDistance) {
          continue;
        }
        const push = (minDistance - distance) * 0.24;
        const ox = dx === 0 && dz === 0 ? push : (dx / distance) * push;
        const oz = dx === 0 && dz === 0 ? 0 : (dz / distance) * push;
        left.x -= ox;
        left.z -= oz;
        right.x += ox;
        right.z += oz;
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

function rebuildMeshes() {
  removeGraphObjects();
  state.nodeIndexById = new Map();

  const nodePositions = new Float32Array(state.visibleNodes.length * 3);
  const nodeColors = new Float32Array(state.visibleNodes.length * 3);
  const nodeSizes = new Float32Array(state.visibleNodes.length);
  const degreeMap = buildDegreeMap(state.visibleEdges);
  state.degreeByNode = degreeMap;
  state.adjacencyByNode = buildAdjacencyMap(state.visibleEdges);
  state.edgesByNode = buildEdgeMap(state.visibleEdges);
  markVisualCacheDirty();

  state.visibleNodes.forEach((node, index) => {
    const position = state.positions.get(node.id) ?? { x: 0, y: 0, z: 0 };
    const color = new THREE.Color(colorForCommunity(node.community));
    const degree = degreeMap.get(node.id) ?? 0;
    const size = clamp(4.5 + Math.log1p(degree) * 1.8, 4.5, 13);
    nodePositions.set([position.x, position.y, position.z], index * 3);
    nodeColors.set([color.r, color.g, color.b], index * 3);
    nodeSizes[index] = size;
    state.nodeIndexById.set(node.id, index);
  });

  const nodeGeometry = new THREE.BufferGeometry();
  nodeGeometry.setAttribute('position', new THREE.BufferAttribute(nodePositions, 3));
  nodeGeometry.setAttribute('color', new THREE.BufferAttribute(nodeColors, 3));
  nodeGeometry.setAttribute('size', new THREE.BufferAttribute(nodeSizes, 1));

  const nodeMaterial = new THREE.PointsMaterial({
    size: 7.2,
    sizeAttenuation: false,
    map: pointTexture,
    vertexColors: true,
    transparent: true,
    opacity: 0.96,
    alphaTest: 0.08,
    depthWrite: false
  });
  nodePoints = new THREE.Points(nodeGeometry, nodeMaterial);
  nodePoints.renderOrder = 2;
  scene.add(nodePoints);

  const edgePositions = new Float32Array(state.visibleEdges.length * 2 * 3);
  const edgeColors = new Float32Array(state.visibleEdges.length * 2 * 3);
  state.visibleEdges.forEach((edge, index) => {
    const source = state.positions.get(edge.source);
    const target = state.positions.get(edge.target);
    if (!source || !target) {
      return;
    }
    edgePositions.set([source.x, source.y, source.z, target.x, target.y, target.z], index * 6);
    const sourceNode = state.visibleNodes[state.nodeIndexById.get(edge.source)];
    const targetNode = state.visibleNodes[state.nodeIndexById.get(edge.target)];
    const sourceColor = new THREE.Color(colorForCommunity(sourceNode?.community ?? ''));
    const targetColor = new THREE.Color(colorForCommunity(targetNode?.community ?? ''));
    edgeColors.set([sourceColor.r, sourceColor.g, sourceColor.b, targetColor.r, targetColor.g, targetColor.b], index * 6);
  });

  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3));
  edgeGeometry.setAttribute('color', new THREE.BufferAttribute(edgeColors, 3));

  const edgeMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  edgeLines.renderOrder = 1;
  scene.add(edgeLines);

  selectedMarker.visible = false;
}

function removeGraphObjects() {
  if (nodePoints) {
    scene.remove(nodePoints);
    nodePoints.geometry.dispose();
    nodePoints.material.dispose();
    nodePoints = null;
  }
  if (edgeLines) {
    scene.remove(edgeLines);
    edgeLines.geometry.dispose();
    edgeLines.material.dispose();
    edgeLines = null;
  }
}

function fitCameraToGraph(preset = 'Fit') {
  fitCameraWithTilt(preset, 0.22, 1.46);
}

function fitCameraWithTilt(preset, zTilt, heightMultiplier) {
  if (!state.visibleNodes.length || !state.positions.size) {
    state.cameraPreset = preset;
    markVisualCacheDirty();
    requestRender();
    return;
  }

  const bounds = boundsForVisibleNodes();
  const width = Math.max(bounds.maxX - bounds.minX, 120);
  const depth = Math.max(bounds.maxZ - bounds.minZ, 120);
  const radius = Math.max(width, depth);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;

  controls.target.set(centerX, 0, centerZ);
  camera.position.set(centerX, radius * heightMultiplier, centerZ + radius * zTilt);
  camera.lookAt(controls.target);
  camera.zoom = clamp(Math.min(stage.clientWidth / (width * 1.18), stage.clientHeight / (depth * 1.18)), 0.08, 6);
  camera.updateProjectionMatrix();
  controls.update();

  state.cameraPreset = preset;
  markVisualCacheDirty();
  updateHud();
  requestRender();
}

function boundsForVisibleNodes() {
  return state.visibleNodes.reduce((bounds, node) => {
    const position = state.positions.get(node.id);
    if (!position) {
      return bounds;
    }
    return {
      minX: Math.min(bounds.minX, position.x),
      maxX: Math.max(bounds.maxX, position.x),
      minZ: Math.min(bounds.minZ, position.z),
      maxZ: Math.max(bounds.maxZ, position.z)
    };
  }, { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
}

function resize() {
  const rect = stage.getBoundingClientRect();
  const width = Math.max(Math.floor(rect.width), 1);
  const height = Math.max(Math.floor(rect.height), 1);

  renderer.setSize(width, height, false);
  markVisualCacheDirty();
  camera.left = -width / 2;
  camera.right = width / 2;
  camera.top = height / 2;
  camera.bottom = -height / 2;
  camera.updateProjectionMatrix();

  if (state.graph) {
    fitCameraToGraph(state.cameraPreset || 'Fit');
  } else {
    requestRender();
  }
}

function render() {
  controls.update();
  renderer.render(scene, camera);
  updateHoverIntensity();
  renderVisualOverlay();
  state.lastFrameStatus = state.visibleProjectedNodeCount > 0 ? 'Visible' : 'Waiting for view';
  updateHud();
}

function renderVisualOverlay() {
  if (!graphVisual || !visualContext || !staticVisualContext) {
    return;
  }

  const metrics = ensureVisualCanvas();
  if (!metrics) {
    return;
  }

  if (!state.visibleNodes.length || !state.positions.size) {
    state.visibleProjectedNodeCount = 0;
    state.projectedPoints = new Map();
    visualContext.setTransform(metrics.pixelRatio, 0, 0, metrics.pixelRatio, 0, 0);
    visualContext.clearRect(0, 0, metrics.width, metrics.height);
    return;
  }

  if (state.visualCacheDirty) {
    rebuildStaticVisualLayer(metrics);
  }

  drawVisualFrame(metrics);
}

function ensureVisualCanvas() {
  const rect = stage.getBoundingClientRect();
  const width = Math.max(Math.floor(rect.width), 1);
  const height = Math.max(Math.floor(rect.height), 1);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const backingWidth = Math.max(Math.floor(width * pixelRatio), 1);
  const backingHeight = Math.max(Math.floor(height * pixelRatio), 1);

  if (graphVisual.width !== backingWidth || graphVisual.height !== backingHeight) {
    graphVisual.width = backingWidth;
    graphVisual.height = backingHeight;
    graphVisual.style.width = `${width}px`;
    graphVisual.style.height = `${height}px`;
    markVisualCacheDirty();
  }

  if (staticVisualLayer.width !== backingWidth || staticVisualLayer.height !== backingHeight) {
    staticVisualLayer.width = backingWidth;
    staticVisualLayer.height = backingHeight;
    markVisualCacheDirty();
  }

  return { width, height, pixelRatio };
}

function rebuildStaticVisualLayer({ width, height, pixelRatio }) {
  camera.updateMatrixWorld();
  const projected = new Map();
  const vector = new THREE.Vector3();
  let projectedNodeCount = 0;

  state.visibleNodes.forEach((node) => {
    const position = state.positions.get(node.id);
    if (!position) {
      return;
    }
    vector.set(position.x, position.y, position.z).project(camera);
    if (vector.z < -1 || vector.z > 1) {
      return;
    }
    const x = (vector.x * 0.5 + 0.5) * width;
    const y = (-vector.y * 0.5 + 0.5) * height;
    projected.set(node.id, {
      x,
      y,
      z: vector.z,
      node
    });
    if (x >= 0 && x <= width && y >= 0 && y <= height) {
      projectedNodeCount += 1;
    }
  });

  state.visibleProjectedNodeCount = projectedNodeCount;
  state.projectedPoints = projected;
  staticVisualContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  staticVisualContext.globalAlpha = 1;
  staticVisualContext.clearRect(0, 0, width, height);

  const baseEdgePath = new Path2D();

  state.visibleEdges.forEach((edge) => {
    const source = projected.get(edge.source);
    const target = projected.get(edge.target);
    if (!source || !target) {
      return;
    }
    addCurvedEdge(baseEdgePath, edge, source, target, 0.74);
  });

  staticVisualContext.save();
  staticVisualContext.lineWidth = 0.48;
  staticVisualContext.lineCap = 'round';
  staticVisualContext.lineJoin = 'round';
  staticVisualContext.globalAlpha = 0.13;
  staticVisualContext.strokeStyle = baseEdgeColor;
  staticVisualContext.stroke(baseEdgePath);
  staticVisualContext.restore();

  state.visibleNodes.forEach((node) => {
    const point = projected.get(node.id);
    if (!point) {
      return;
    }
    const degree = state.degreeByNode.get(node.id) ?? 0;
    const depth = depthPresence(point.z);
    const radius = clamp(1.75 + Math.log1p(degree) * 0.5, 1.75, 5.1) * depth;
    staticVisualContext.beginPath();
    staticVisualContext.arc(point.x, point.y, radius, 0, Math.PI * 2);
    staticVisualContext.fillStyle = colorForCommunity(node.community);
    staticVisualContext.globalAlpha = 0.68 + depth * 0.22;
    staticVisualContext.fill();
  });

  state.visualCacheDirty = false;
}

function drawVisualFrame({ width, height, pixelRatio }) {
  const hoverTrails = updateHoverTrails();
  const activeAmount = hoverTrails.reduce((max, trail) => Math.max(max, trail.intensity), 0);
  const hoverAmount = smoothstep(activeAmount);
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const breath = state.ambientPhase
    ? Math.sin(state.ambientPhase * 0.52) * ambientBreathScale
    : 0;

  visualContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  visualContext.globalAlpha = 1;
  visualContext.clearRect(0, 0, width, height);

  visualContext.save();
  visualContext.translate(centerX, centerY);
  visualContext.scale(1 + breath, 1 + breath);
  visualContext.translate(-centerX, -centerY);
  visualContext.drawImage(staticVisualLayer, 0, 0, width, height);
  visualContext.restore();

  if (hoverAmount > 0.01) {
    visualContext.save();
    visualContext.globalAlpha = 0.1 * hoverAmount;
    visualContext.fillStyle = '#050812';
    visualContext.fillRect(0, 0, width, height);
    visualContext.restore();
  }

  drawActiveVisualOverlay(hoverTrails, hoverAmount, width, height);
}

function drawActiveVisualOverlay(hoverTrails, hoverAmount, width, height) {
  const nodeFocus = buildNodeFocusMap(hoverTrails);
  if (state.selectedNode) {
    mergeNodeFocus(nodeFocus, state.selectedNode.id, 1, 0);
  }

  const highlightedEdges = buildHighlightedEdges(hoverTrails, width, height);
  if (hoverAmount > 0.01) {
    visualContext.save();
    visualContext.lineWidth = 0.72 + hoverAmount * 0.68;
    visualContext.lineCap = 'round';
    visualContext.lineJoin = 'round';
    visualContext.shadowColor = 'rgba(210, 222, 255, 0.22)';
    visualContext.shadowBlur = 8 * hoverAmount;
    highlightedEdges.forEach((edge) => {
      visualContext.globalAlpha = 0.14 + edge.intensity * 0.5;
      visualContext.strokeStyle = edge.color;
      visualContext.stroke(edge.path);
    });
    visualContext.restore();
  }

  nodeFocus.forEach((focusState, nodeId) => {
    const nodeIndex = state.nodeIndexById.get(nodeId);
    const node = state.visibleNodes[nodeIndex];
    const rawPoint = state.projectedPoints.get(nodeId);
    if (!node || !rawPoint) {
      return;
    }
    const point = ambientProjectedPoint(rawPoint, width, height);
    if (!point) {
      return;
    }
    const degree = state.degreeByNode.get(node.id) ?? 0;
    const isSelected = state.selectedNode?.id === node.id;
    const selfAmount = smoothstep(focusState.self);
    const neighborAmount = smoothstep(focusState.neighbor);
    const isHovered = selfAmount > 0.02;
    const isNeighbor = neighborAmount > 0.02;
    const depth = depthPresence(point.z);
    const baseRadius = (isSelected ? 5.2 : clamp(1.75 + Math.log1p(degree) * 0.5, 1.75, 5.1)) * depth;
    const radius = baseRadius + 1.8 * selfAmount + 0.8 * neighborAmount;
    const baseAlpha = 0.68 + depth * 0.22;
    const dimmedAlpha = hoverTrails.length && !isHovered && !isNeighbor ? baseAlpha - 0.42 * hoverAmount : baseAlpha;
    const alpha = dimmedAlpha + ((isHovered || isNeighbor) ? 0.12 * Math.max(selfAmount, neighborAmount) : 0);
    const fillColor = isSelected || isHovered || isNeighbor
      ? accentColorForCommunity(node.community)
      : colorForCommunity(node.community);

    if (isSelected || isHovered) {
      visualContext.save();
      visualContext.beginPath();
      visualContext.arc(point.x, point.y, radius + 2.4 + 3.2 * Math.max(selfAmount, 0.55), 0, Math.PI * 2);
      visualContext.fillStyle = accentColorForCommunity(node.community);
      visualContext.globalAlpha = isHovered ? 0.08 + selfAmount * 0.2 : 0.1;
      visualContext.shadowColor = 'rgba(214, 226, 255, 0.22)';
      visualContext.shadowBlur = 12 * Math.max(selfAmount, 0.55);
      visualContext.fill();
      visualContext.restore();
    }

    visualContext.beginPath();
    visualContext.arc(point.x, point.y, radius, 0, Math.PI * 2);
    visualContext.fillStyle = fillColor;
    visualContext.globalAlpha = isSelected || isHovered ? 1 : alpha;
    visualContext.fill();

    if (isSelected || isHovered) {
      visualContext.globalAlpha = 1;
      visualContext.lineWidth = isHovered ? 1.2 + selfAmount : 1.8;
      visualContext.strokeStyle = selectedStrokeColor;
      visualContext.stroke();
    }
  });
}

function buildHighlightedEdges(hoverTrails, width, height) {
  const highlightedEdges = [];
  const seenEdges = new Set();
  hoverTrails.forEach((trail) => {
    const linkedEdges = state.edgesByNode.get(trail.node.id) ?? [];
    linkedEdges.forEach((edge) => {
      if (trail.intensity <= 0.02 || seenEdges.has(edge.id)) {
        return;
      }
      const source = state.projectedPoints.get(edge.source);
      const target = state.projectedPoints.get(edge.target);
      if (!source || !target) {
        return;
      }
      const highlightedPath = new Path2D();
      addCurvedEdge(
        highlightedPath,
        edge,
        ambientProjectedPoint(source, width, height),
        ambientProjectedPoint(target, width, height),
        1
      );
      highlightedEdges.push({
        path: highlightedPath,
        color: accentColorForCommunity(trail.node.community),
        intensity: smoothstep(trail.intensity)
      });
      seenEdges.add(edge.id);
    });
  });
  return highlightedEdges;
}

function addCurvedEdge(path, edge, source, target, strength = 1) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.max(Math.hypot(dx, dy), 0.001);
  const bendSeed = hashString(edge.id || `${edge.source}:${edge.target}`);
  const sign = bendSeed % 2 === 0 ? 1 : -1;
  const bend = clamp(length * 0.075, 4, 34) * strength * sign;
  const controlX = (source.x + target.x) / 2 + (-dy / length) * bend;
  const controlY = (source.y + target.y) / 2 + (dx / length) * bend;
  path.moveTo(source.x, source.y);
  path.quadraticCurveTo(controlX, controlY, target.x, target.y);
}

function depthPresence(projectedZ) {
  const distance = clamp((projectedZ + 1) / 2, 0, 1);
  return clamp(0.98 - distance * 0.2, 0.78, 0.98);
}

function ambientProjectedPoint(point, width, height) {
  if (!state.ambientPhase || ambientMotionScale <= 0) {
    return point;
  }
  const seed = hashString(point.node.id);
  const phase = state.ambientPhase + (seed % 628) * 0.01;
  const depth = depthPresence(point.z);
  const interactionDamping = state.hoveredNode || state.selectedNode ? 0.58 : 1;
  const amplitude = ambientLocalAmplitude * depth * interactionDamping;
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const breath = Math.sin(state.ambientPhase * 0.52) * ambientBreathScale * interactionDamping;
  return {
    ...point,
    x: point.x + (point.x - centerX) * breath + Math.cos(phase * 0.88) * amplitude,
    y: point.y + (point.y - centerY) * breath + Math.sin(phase * 0.7 + (seed % 97) * 0.013) * amplitude * 0.72
  };
}

function updateHoverTrails() {
  const hoveredNode = state.hoveredNode;
  if (hoveredNode) {
    const current = state.hoverTrails.get(hoveredNode.id);
    state.hoverTrails.set(hoveredNode.id, {
      node: hoveredNode,
      intensity: current?.intensity ?? 0
    });
  }

  state.hoverTrails.forEach((trail, nodeId) => {
    const target = hoveredNode?.id === nodeId ? 1 : 0;
    const speed = target > trail.intensity ? 0.24 : 0.075;
    trail.intensity += (target - trail.intensity) * speed;
    if (target === 0 && trail.intensity < 0.025) {
      state.hoverTrails.delete(nodeId);
    }
  });

  return Array.from(state.hoverTrails.values());
}

function buildNodeFocusMap(hoverTrails) {
  const focus = new Map();
  hoverTrails.forEach((trail) => {
    mergeNodeFocus(focus, trail.node.id, trail.intensity, 0);
    const neighbors = state.adjacencyByNode.get(trail.node.id) ?? new Set();
    neighbors.forEach((neighborId) => {
      mergeNodeFocus(focus, neighborId, 0, trail.intensity * 0.78);
    });
  });
  return focus;
}

function mergeNodeFocus(focus, nodeId, self, neighbor) {
  const current = focus.get(nodeId) ?? { self: 0, neighbor: 0 };
  focus.set(nodeId, {
    self: Math.max(current.self, self),
    neighbor: Math.max(current.neighbor, neighbor)
  });
}

function updateHoverIntensity() {
  const target = state.hoveredNode ? 1 : 0;
  const delta = target - state.hoverIntensity;
  if (Math.abs(delta) < 0.012) {
    state.hoverIntensity = target;
    if (target === 0) {
      state.hoverVisualNode = null;
    }
    return;
  }
  state.hoverIntensity += delta * 0.18;
  requestRender();
}

function smoothstep(value) {
  const x = clamp(value, 0, 1);
  return x * x * (3 - 2 * x);
}

function requestRender() {
  if (state.animationFrame) {
    return;
  }
  state.animationFrame = requestAnimationFrame(() => {
    state.animationFrame = null;
    render();
  });
}

function markVisualCacheDirty() {
  state.visualCacheDirty = true;
}

function startAmbientMotion() {
  if (state.ambientFrame || !state.visibleNodes.length) {
    return;
  }
  state.ambientFrame = requestAnimationFrame(ambientMotionTick);
}

function ambientMotionTick(timestamp) {
  state.ambientFrame = null;
  if (document.hidden || !state.visibleNodes.length) {
    return;
  }
  if (timestamp - state.lastAmbientTimestamp >= ambientFrameInterval) {
    state.lastAmbientTimestamp = timestamp;
    state.ambientPhase = timestamp * 0.001;
    renderVisualOverlay();
  }
  startAmbientMotion();
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
  const base = `${state.visibleNodes.length} nodes · ${state.visibleEdges.length} edges · ${lensLabel} · 3D Beta`;
  const status = state.lastFrameStatus === 'Visible'
    ? ''
    : ` · ${state.cameraPreset} · ${state.lastFrameStatus}`;
  const nextText = state.lastDiagnostic ? `${base} · ${state.lastDiagnostic}` : `${base}${status}`;
  if (hud.textContent !== nextText) {
    hud.textContent = nextText;
  }
  hud.hidden = false;
}

function selectNode(node, focusCamera = false) {
  state.selectedNode = node;
  renderNodeInfo(node);
  positionSelectedMarker(node);
  if (focusCamera) {
    focusNode(node);
  }
  requestRender();
}

function positionSelectedMarker(node) {
  const position = state.positions.get(node?.id);
  if (!position) {
    selectedMarker.visible = false;
    return;
  }
  selectedMarker.position.set(position.x, position.y, position.z);
  selectedMarker.visible = true;
}

function focusNode(node) {
  const position = state.positions.get(node.id);
  if (!position) {
    return;
  }
  controls.target.set(position.x, position.y, position.z);
  camera.zoom = clamp(Math.max(camera.zoom, 1.5), 0.08, 8);
  camera.updateProjectionMatrix();
  controls.update();
  state.cameraPreset = 'Node focus';
  markVisualCacheDirty();
  updateHud();
  requestRender();
}

function nodeAtEvent(event) {
  if (!nodePoints) {
    return null;
  }
  const rect = renderer.domElement.getBoundingClientRect();
  state.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  state.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  state.raycaster.params.Points.threshold = Math.max(8, 12 / Math.max(camera.zoom, 0.2));
  state.raycaster.setFromCamera(state.pointer, camera);
  const intersections = state.raycaster.intersectObject(nodePoints, false);
  if (!intersections.length) {
    return null;
  }
  return state.visibleNodes[intersections[0].index] ?? null;
}

function resetCamera() {
  fitCameraToGraph('Fit');
}

function zoomCamera(multiplier) {
  camera.zoom = clamp(camera.zoom * multiplier, 0.08, 8);
  camera.updateProjectionMatrix();
  state.cameraPreset = multiplier > 1 ? 'Zoom in' : 'Zoom out';
  markVisualCacheDirty();
  updateHud();
  requestRender();
}

function topView() {
  fitCameraWithTilt('Top view', 0.001, 1.55);
}

function resetTilt() {
  fitCameraToGraph('Reset tilt');
}

function degreeForNode(nodeId) {
  return state.visibleEdges.filter((edge) => edge.source === nodeId || edge.target === nodeId).length;
}

function colorForCommunity(name) {
  const community = state.communities.find((item) => item.name === name);
  return community?.color ?? palette[0];
}

function accentColorForCommunity(name) {
  const community = state.communities.find((item) => item.name === name);
  return community?.accentColor ?? accentPalette[0];
}

function reportDiagnostic(message, showsOverlay = false) {
  const text = String(message || '3D renderer failed');
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

function wireEvents() {
  renderer?.domElement?.addEventListener('pointermove', (event) => {
    const node = nodeAtEvent(event);
    if (node !== state.hoveredNode) {
      if (node && state.hoveredNode) {
        state.hoverIntensity = Math.min(state.hoverIntensity, 0.35);
      }
      state.hoveredNode = node;
      if (node) {
        state.hoverVisualNode = node;
      }
      stage.style.cursor = node ? 'pointer' : 'grab';
      requestRender();
    }
  });

  renderer?.domElement?.addEventListener('pointerleave', () => {
    if (!state.hoveredNode) {
      return;
    }
    state.hoveredNode = null;
    stage.style.cursor = 'grab';
    requestRender();
  });

  renderer?.domElement?.addEventListener('click', (event) => {
    const node = nodeAtEvent(event);
    if (node) {
      selectNode(node);
    }
  });

  renderer?.domElement?.addEventListener('dblclick', (event) => {
    const node = nodeAtEvent(event);
    if (node) {
      sendNodeAction('openNode', node);
    }
  });

  search.addEventListener('input', renderSearchResults);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      startAmbientMotion();
    }
  });
  new ResizeObserver(resize).observe(stage);

  window.addEventListener('error', (event) => {
    reportDiagnostic(event.message || '3D renderer failed', true);
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportDiagnostic(event.reason?.message || '3D renderer failed', true);
  });

  renderer?.domElement?.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    reportDiagnostic('WebGL context lost', true);
  });
}

function isBrainBarWebKitScheme() {
  return window.location.protocol === 'brainbar3d:';
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

function createPointTexture() {
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = 64;
  textureCanvas.height = 64;
  const textureContext = textureCanvas.getContext('2d');
  const gradient = textureContext.createRadialGradient(32, 32, 0, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.58, 'rgba(255,255,255,0.94)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  textureContext.fillStyle = gradient;
  textureContext.beginPath();
  textureContext.arc(32, 32, 31, 0, Math.PI * 2);
  textureContext.fill();
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function installWindowAPI() {
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
    cameraZoom: camera?.zoom ?? 0,
    drawCalls: renderer?.info?.render?.calls ?? 0,
    triangles: renderer?.info?.render?.triangles ?? 0,
    points: renderer?.info?.render?.points ?? 0,
    lines: renderer?.info?.render?.lines ?? 0,
    visibleProjectedNodeCount: state.visibleProjectedNodeCount,
    stageWidth: stage.clientWidth,
    stageHeight: stage.clientHeight,
    diagnostic: state.lastDiagnostic
  });
}
