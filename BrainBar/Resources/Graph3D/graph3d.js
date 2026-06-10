import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import {
  breathingStyle,
  createLivingPulse,
  pruneLivingPulses,
  pulseVisualState,
  selectAmbientRecentNodeIds
} from './graph3d-living-utils.mjs';
import { computePathVariants, explainShortestPath } from './graph3d-path-utils.mjs';
import {
  activeModeFromState,
  buildProjectedNodeGrid,
  labelBudgetForMode,
  nearbyProjectedNodeIds,
  spotlightBudgets
} from './graph3d-polish-utils.mjs';
import { nearestKeyNotePath, recentOrbitCandidates } from './graph3d-recent-utils.mjs';
import { searchGraphNodes } from './graph3d-search-utils.mjs';
import { buildGraphStorySteps, graphStoryPresentation } from './graph3d-story-utils.mjs';

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
const ambientMotionScale = prefersReducedMotion ? 0 : 1;
const ambientLocalAmplitude = 1.8 * ambientMotionScale;
const ambientSampleTarget = 520;
const ambientRecentNodeLimit = 24;
const livingPulseNodeLimit = 16;
const livingPulseEdgeLimit = 48;
const spotlightFocusNodeLimit = 72;
const spotlightSmallCommunityLimit = 80;
const spotlightInternalEdgeLimit = 180;
const spotlightBridgeEdgeLimit = 80;
const recentOrbitNodeLimit = 24;
const recentOrbitPanelLimit = 12;
const recentOrbitKeyNoteLimit = 12;
const graphStoryRecentLimit = 12;
const graphStoryKeyNoteLimit = 12;
const graphStoryCommunityLimit = 3;
const graphStoryBridgeLimit = 10;
const graphStoryEdgeLimit = 80;
const graphStoryPreviewLimit = 3;
const searchResultLimit = 20;
const searchRevealNeighborLimit = 16;

const pointTexture = createPointTexture();

const state = {
  graph: null,
  lens: 'all',
  communities: [],
  communityByName: new Map(),
  communityEnabled: new Set(),
  visibleNodes: [],
  visibleEdges: [],
  visibleNodeIds: new Set(),
  positions: new Map(),
  degreeByNode: new Map(),
  adjacencyByNode: new Map(),
  edgesByNode: new Map(),
  edgeById: new Map(),
  projectedPoints: new Map(),
  visualCacheDirty: true,
  selectedNode: null,
  hoveredNode: null,
  hoveredEdge: null,
  hoverVisualNode: null,
  hoverTrails: new Map(),
  edgeTrails: new Map(),
  hoverIntensity: 0,
  focusMode: false,
  focusDepth: 1,
  focusNodeId: null,
  focusNodeIds: new Set(),
  focusEdgeIds: new Set(),
  focusNodeDistance: new Map(),
  communitySpotlightName: null,
  communitySpotlightNodeIds: new Set(),
  communitySpotlightEdgeIds: new Set(),
  communitySpotlightFocusNodeIds: new Set(),
  communitySpotlightOverlayEdgeIds: new Set(),
  communitySpotlightSummary: null,
  recentOrbitMode: false,
  recentOrbitNodeIds: new Set(),
  recentOrbitActiveNodeId: null,
  recentOrbitTargetNodeId: null,
  recentOrbitPathNodeIds: new Set(),
  recentOrbitPathEdgeIds: new Set(),
  recentOrbitOrderedNodeIds: [],
  recentOrbitOrderedEdgeIds: [],
  recentOrbitItems: [],
  recentOrbitMessage: '',
  graphStoryMode: false,
  graphStorySteps: [],
  graphStoryStepIndex: 0,
  graphStoryNodeIds: new Set(),
  graphStoryEdgeIds: new Set(),
  graphStoryFocusNodeIds: new Set(),
  graphStoryActiveNodeId: null,
  graphStoryActiveCommunityName: null,
  graphStoryMessage: '',
  searchResultIds: [],
  searchRevealNodeId: null,
  searchRevealNeighborIds: new Set(),
  searchRevealEdgeIds: new Set(),
  pathMode: false,
  pathSourceId: null,
  pathTargetId: null,
  pathNodeIds: new Set(),
  pathEdgeIds: new Set(),
  pathOrderedNodeIds: [],
  pathOrderedEdgeIds: [],
  pathVariants: [],
  activePathVariantId: 'shortest',
  pathMessage: '',
  pathPulsePhase: 0,
  lastDiagnostic: '',
  cameraPreset: 'Fit',
  lastFrameStatus: 'Waiting',
  visibleProjectedNodeCount: 0,
  visibleGraphRevision: 0,
  visualRevision: 0,
  projectedPointGrid: null,
  overlayCache: { key: '', edges: [] },
  spotlightCache: new Map(),
  livingPulseEvents: [],
  ambientRecentNodeIds: new Set(),
  lastLivingInteractionAt: 0,
  performanceStats: {
    staticRebuildMs: 0,
    overlayFrameMs: 0,
    highlightedEdgeCount: 0,
    lastHitTestCandidateCount: 0,
    livingPulseCount: 0,
    ambientRecentCount: 0
  },
  pointer: new THREE.Vector2(),
  raycaster: new THREE.Raycaster(),
  nodeIndexById: new Map(),
  pendingPointerEvent: null,
  pointerHitFrame: null,
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
  controls.zoomToCursor = true;
  controls.minPolarAngle = 0.08;
  controls.maxPolarAngle = Math.PI - 0.08;
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
  state.communityByName = new Map(state.communities.map((community) => [community.name, community]));
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
    state.visibleNodeIds = new Set(state.visibleNodes.map((node) => node.id));
    state.visibleEdges = lensEdges.filter((edge) => state.visibleNodeIds.has(edge.source) && state.visibleNodeIds.has(edge.target));
    state.hoveredNode = null;
    state.hoveredEdge = null;
    state.hoverVisualNode = null;
    state.hoverTrails = new Map();
    state.edgeTrails = new Map();
    state.hoverIntensity = 0;
    clearInteractiveModes();
    state.visibleGraphRevision += 1;
    state.spotlightCache.clear();
    updateAmbientRecentNodes();
    clearLivingPulses(false);
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

function activeMode() {
  return activeModeFromState(state);
}

function clearInteractiveModes({ preservePathSource = false } = {}) {
  clearLivingPulses(false);
  clearFocusOrbit(false);
  if (!(preservePathSource && state.pathMode && state.pathSourceId && !state.pathTargetId)) {
    clearPathMode(false);
  }
  clearCommunitySpotlight(false);
  clearRecentOrbit(false);
  clearGraphStory(false);
  clearSearchReveal(false);
}

function isObsidianEdge(edge) {
  const values = [edge.context, edge.relation, edge.label, edge.title]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  return values.some((value) => value === 'obsidian_wikilink' || value.includes('obsidian_wikilink'));
}

function calculateLayout() {
  state.positions = new Map();
  const nodesByCommunity = new Map();
  const degreeMap = buildDegreeMap(state.visibleEdges);
  const sortedNodes = [...state.visibleNodes].sort((left, right) => {
    const communityOrder = String(left.community).localeCompare(String(right.community));
    return communityOrder !== 0 ? communityOrder : String(left.label).localeCompare(String(right.label));
  });
  const nodeCount = Math.max(sortedNodes.length, 1);
  const outerRadius = clamp(Math.sqrt(nodeCount) * 14.2, 240, 780);

  state.visibleNodes.forEach((node) => {
    const nodes = nodesByCommunity.get(node.community) ?? [];
    nodes.push(node);
    nodesByCommunity.set(node.community, nodes);
  });

  sortedNodes.forEach((node, index) => {
    const seed = hashString(`${node.id}:${node.community}`);
    const degree = degreeMap.get(node.id) ?? 0;
    const angle = index * 2.399963229728653 + (seed % 628) / 100;
    const baseDistance = Math.sqrt((index + 0.5) / nodeCount) * outerRadius;
    const hubPull = clamp(Math.log1p(degree) / 7, 0, 0.55);
    const distanceJitter = (((seed % 1000) / 1000) - 0.5) * 34;
    const distance = clamp((baseDistance * (1 - hubPull * 0.42)) + distanceJitter, 24, outerRadius);
    const depth = depthForNode(node, 0, index, degreeMap);
    state.positions.set(node.id, {
      x: Math.cos(angle) * distance,
      y: depth,
      z: Math.sin(angle) * distance
    });
  });

  relaxLayout(nodesByCommunity);
  expandDepthForSideViews();
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
  const hubLift = Math.min(260, Math.log1p(degree) * 38);
  const communityBand = ((hashString(node.community) % 29) - 14) * 24;
  const organicLayer = (((seed % 1000) / 1000) - 0.5) * 520;
  const localWave = Math.sin((localIndex + 1) * 1.618 + (seed % 97)) * 150;
  return clamp(communityBand + organicLayer + localWave + hubLift - 126, -980, 1120);
}

function depthLayerOffset(communityIndex, communityCount, clusterRadius) {
  const layerCount = Math.min(11, Math.max(5, Math.ceil(Math.sqrt(communityCount))));
  const layer = (communityIndex % layerCount) - (layerCount - 1) / 2;
  const sweep = (Math.floor(communityIndex / layerCount) % 3) - 1;
  const layerSpacing = clamp((clusterRadius / layerCount) * 1.85, 95, 190);
  return (layer * layerSpacing) + (sweep * layerSpacing * 0.32);
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
      const force = (length - 68) * 0.003;
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

function expandDepthForSideViews() {
  if (!state.visibleNodes.length || !state.positions.size) {
    return;
  }

  const bounds = boundsForVisibleNodes();
  const width = Math.max(bounds.maxX - bounds.minX, 120);
  const depth = Math.max(bounds.maxZ - bounds.minZ, 120);
  const currentY = Math.max(bounds.maxY - bounds.minY, 1);
  const planarSpan = Math.max(width, depth);
  const targetY = clamp(planarSpan * 1.02, 920, 1900);

  if (currentY >= targetY * 0.9) {
    return;
  }

  const centerY = (bounds.minY + bounds.maxY) / 2;
  const scale = targetY / currentY;
  state.positions.forEach((position) => {
    position.y = centerY + (position.y - centerY) * scale;
  });
}

function separateLocalNodes(nodesByCommunity) {
  const minDistance = 13;
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
  state.edgeById = new Map(state.visibleEdges.map((edge) => [edge.id, edge]));
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
  fitCameraWithTilt(preset, 1.12, 0.54);
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
  const height = Math.max(bounds.maxY - bounds.minY, 120);
  const radius = Math.max(width, depth, height * 0.66);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const verticalSpan = Math.max(depth * 0.58, height * 1.08);

  controls.target.set(centerX, centerY, centerZ);
  camera.position.set(centerX, centerY + radius * heightMultiplier, centerZ + radius * zTilt);
  camera.lookAt(controls.target);
  camera.zoom = clamp(Math.min(stage.clientWidth / (width * 1.08), stage.clientHeight / (verticalSpan * 1.08)), 0.08, 6);
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
      minY: Math.min(bounds.minY, position.y),
      maxY: Math.max(bounds.maxY, position.y),
      minZ: Math.min(bounds.minZ, position.z),
      maxZ: Math.max(bounds.maxZ, position.z)
    };
  }, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity });
}

function boundsForPositions(positions) {
  return positions.reduce((bounds, position) => ({
    minX: Math.min(bounds.minX, position.x),
    maxX: Math.max(bounds.maxX, position.x),
    minY: Math.min(bounds.minY, position.y),
    maxY: Math.max(bounds.maxY, position.y),
    minZ: Math.min(bounds.minZ, position.z),
    maxZ: Math.max(bounds.maxZ, position.z)
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity });
}

function fitCameraToPositions(positions, preset, options = {}) {
  const validPositions = (positions || []).filter(Boolean);
  if (!validPositions.length) {
    return;
  }
  const bounds = boundsForPositions(validPositions);
  const center = new THREE.Vector3(
    (bounds.minX + bounds.maxX) / 2,
    (bounds.minY + bounds.maxY) / 2,
    (bounds.minZ + bounds.maxZ) / 2
  );
  const span = Math.max(
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY,
    bounds.maxZ - bounds.minZ,
    options.minimumSpan ?? 160
  );
  const widthPadding = options.widthPadding ?? 1.18;
  const heightPadding = options.heightPadding ?? 0.96;
  const minZoom = options.minZoom ?? 0.2;
  const maxZoom = options.maxZoom ?? 4.8;
  const zoom = clamp(Math.min(stage.clientWidth / (span * widthPadding), stage.clientHeight / (span * heightPadding)), minZoom, maxZoom);
  orbitCameraTo(center, zoom, preset);
}

function fitCameraToNodeIds(nodeIds, preset, options = {}) {
  const positions = Array.from(nodeIds || [])
    .map((nodeId) => state.positions.get(nodeId))
    .filter(Boolean);
  fitCameraToPositions(positions, preset, options);
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

  const startedAt = performance.now();
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
  state.performanceStats.overlayFrameMs = performance.now() - startedAt;
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
  const startedAt = performance.now();
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
  state.projectedPointGrid = buildProjectedNodeGrid(projected);
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
  staticVisualContext.lineWidth = 0.62;
  staticVisualContext.lineCap = 'round';
  staticVisualContext.lineJoin = 'round';
  staticVisualContext.globalAlpha = 0.22;
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
    const radius = nodeRadiusForDegree(degree, depth);
    staticVisualContext.save();
    staticVisualContext.beginPath();
    staticVisualContext.arc(point.x, point.y, Math.max(radius - 0.35, 1.2), 0, Math.PI * 2);
    staticVisualContext.fillStyle = colorForCommunity(node.community);
    staticVisualContext.globalAlpha = 0.035 + depth * 0.015;
    staticVisualContext.fill();
    staticVisualContext.beginPath();
    staticVisualContext.arc(point.x, point.y, radius, 0, Math.PI * 2);
    staticVisualContext.strokeStyle = colorForCommunity(node.community);
    staticVisualContext.globalAlpha = 0.58 + depth * 0.24;
    staticVisualContext.lineWidth = clamp(0.68 + Math.log1p(degree) * 0.08, 0.68, 1.25);
    staticVisualContext.stroke();
    staticVisualContext.restore();
  });

  state.visualCacheDirty = false;
  state.performanceStats.staticRebuildMs = performance.now() - startedAt;
}

function drawVisualFrame({ width, height, pixelRatio }) {
  const hoverTrails = updateHoverTrails();
  const edgeTrails = updateEdgeTrails();
  const activeAmount = Math.max(
    state.pathMode && state.pathOrderedNodeIds.length ? 1 : 0,
    state.focusMode ? 1 : 0,
    state.communitySpotlightName ? 1 : 0,
    state.recentOrbitMode ? 1 : 0,
    state.graphStoryMode ? 1 : 0,
    state.searchRevealNodeId ? 1 : 0,
    state.selectedNode ? 1 : 0,
    hoverTrails.reduce((max, trail) => Math.max(max, trail.intensity), 0),
    edgeTrails.reduce((max, trail) => Math.max(max, trail.intensity), 0)
  );
  const hoverAmount = smoothstep(activeAmount);

  visualContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  visualContext.globalAlpha = 1;
  visualContext.clearRect(0, 0, width, height);

  visualContext.drawImage(staticVisualLayer, 0, 0, width, height);
  drawAmbientNodeMotion(width, height);
  drawAmbientRecentWarmth(width, height);

  if (hoverAmount > 0.01) {
    visualContext.save();
    const dimAlpha = state.focusMode ? 0.28 : (state.communitySpotlightName || state.recentOrbitMode || state.graphStoryMode || state.searchRevealNodeId ? 0.18 : 0.1);
    visualContext.globalAlpha = dimAlpha * hoverAmount;
    visualContext.fillStyle = '#050812';
    visualContext.fillRect(0, 0, width, height);
    visualContext.restore();
  }

  drawActiveVisualOverlay(hoverTrails, edgeTrails, hoverAmount, width, height);
  drawLivingPulses(width, height);
  if (state.pathMode && state.pathOrderedEdgeIds.length && !prefersReducedMotion) {
    state.pathPulsePhase = performance.now() * 0.001;
    requestRender();
  }
  if (state.livingPulseEvents.length && !prefersReducedMotion) {
    requestRender();
  }
}

function drawAmbientNodeMotion(width, height) {
  if (!state.ambientPhase || ambientMotionScale <= 0 || !state.projectedPoints.size) {
    return;
  }
  const stride = Math.max(1, Math.ceil(state.visibleNodes.length / ambientSampleTarget));
  visualContext.save();
  visualContext.lineWidth = 0.86;
  state.visibleNodes.forEach((node, index) => {
    if (index % stride !== 0) {
      return;
    }
    const rawPoint = state.projectedPoints.get(node.id);
    if (!rawPoint) {
      return;
    }
    const degree = state.degreeByNode.get(node.id) ?? 0;
    const depth = depthPresence(rawPoint.z);
    const baseRadius = nodeRadiusForDegree(degree, depth) * 0.82;
    const breath = breathingStyle({
      phase: state.ambientPhase,
      nodeId: node.id,
      baseRadius,
      depth,
      reducedMotion: prefersReducedMotion
    });
    const point = {
      ...rawPoint,
      x: rawPoint.x + breath.offsetX,
      y: rawPoint.y + breath.offsetY
    };
    const radius = breath.radius;
    visualContext.beginPath();
    visualContext.arc(point.x, point.y, Math.max(radius - 0.55, 1.2), 0, Math.PI * 2);
    visualContext.fillStyle = colorForCommunity(node.community);
    visualContext.globalAlpha = breath.fillAlpha;
    visualContext.fill();
    visualContext.beginPath();
    visualContext.arc(point.x, point.y, radius, 0, Math.PI * 2);
    visualContext.strokeStyle = colorForCommunity(node.community);
    visualContext.globalAlpha = breath.strokeAlpha;
    visualContext.stroke();
  });
  visualContext.restore();
}

function drawAmbientRecentWarmth(width, height) {
  if (!state.ambientRecentNodeIds.size || !state.projectedPoints.size) {
    return;
  }
  const mode = activeMode();
  const activeDamping = mode === 'none' ? 1 : 0.42;
  const phase = state.ambientPhase || performance.now() * 0.001;
  visualContext.save();
  state.ambientRecentNodeIds.forEach((nodeId) => {
    const node = nodeForId(nodeId);
    const rawPoint = state.projectedPoints.get(nodeId);
    if (!node || !rawPoint) {
      return;
    }
    const point = ambientProjectedPoint(rawPoint, width, height);
    const degree = state.degreeByNode.get(node.id) ?? 0;
    const depth = depthPresence(point.z);
    const baseRadius = nodeRadiusForDegree(degree, depth);
    const wave = prefersReducedMotion ? 0.35 : (Math.sin(phase * 0.84 + hashString(nodeId) * 0.003) + 1) * 0.5;
    const radius = baseRadius + 2.8 + wave * 2.2;
    visualContext.beginPath();
    visualContext.arc(point.x, point.y, radius + 4.5, 0, Math.PI * 2);
    visualContext.fillStyle = accentColorForCommunity(node.community);
    visualContext.globalAlpha = (prefersReducedMotion ? 0.045 : 0.052 + wave * 0.042) * activeDamping;
    visualContext.shadowColor = 'rgba(164, 224, 214, 0.18)';
    visualContext.shadowBlur = prefersReducedMotion ? 0 : 10 + wave * 8;
    visualContext.fill();
    visualContext.beginPath();
    visualContext.arc(point.x, point.y, Math.max(baseRadius + 0.8, 2.2), 0, Math.PI * 2);
    visualContext.strokeStyle = accentColorForCommunity(node.community);
    visualContext.globalAlpha = (prefersReducedMotion ? 0.10 : 0.12 + wave * 0.08) * activeDamping;
    visualContext.lineWidth = 0.85;
    visualContext.stroke();
  });
  visualContext.restore();
}

function drawActiveVisualOverlay(hoverTrails, edgeTrails, hoverAmount, width, height) {
  const nodeFocus = buildNodeFocusMap(hoverTrails, edgeTrails);
  const highlightedEdges = buildHighlightedEdges(hoverTrails, edgeTrails, width, height);
  state.performanceStats.highlightedEdgeCount = highlightedEdges.length;
  const labelCandidates = [];
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
    const baseRadius = isSelected ? nodeRadiusForDegree(degree, depth) * 1.18 : nodeRadiusForDegree(degree, depth);
    const radius = baseRadius + 1.8 * selfAmount + 0.8 * neighborAmount;
    const baseAlpha = 0.68 + depth * 0.22;
    const dimmedAlpha = hoverTrails.length && !isHovered && !isNeighbor ? baseAlpha - 0.42 * hoverAmount : baseAlpha;
    const alpha = dimmedAlpha + ((isHovered || isNeighbor) ? 0.12 * Math.max(selfAmount, neighborAmount) : 0);
    const fillColor = isSelected || isHovered || isNeighbor
      ? accentColorForCommunity(node.community)
      : colorForCommunity(node.community);
    const labelAmount = isSelected ? 1 : Math.max(selfAmount, neighborAmount * 0.82);

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

    if (labelAmount > 0.14) {
      labelCandidates.push({
        node,
        point,
        radius,
        amount: labelAmount,
        isPrimary: isSelected || isHovered,
        degree,
        color: accentColorForCommunity(node.community)
      });
    }
  });

  drawActiveNodeLabels(labelCandidates, width, height);
  drawPathPulseOverlay(width, height);
}

function drawActiveNodeLabels(candidates, width, height) {
  if (!candidates.length) {
    return;
  }

  const maxLabels = labelBudgetForMode(activeMode(), {
    hasSelected: !!state.selectedNode,
    hasHover: !!state.hoveredNode || !!state.hoveredEdge
  });
  if (maxLabels <= 0) {
    return;
  }
  const placedLabels = [];
  const orderedCandidates = candidates
    .sort((left, right) => {
      const leftScore = (left.isPrimary ? 100 : 0) + left.amount * 12 + Math.log1p(left.degree);
      const rightScore = (right.isPrimary ? 100 : 0) + right.amount * 12 + Math.log1p(right.degree);
      return rightScore - leftScore;
    })
    .slice(0, maxLabels * 2);

  visualContext.save();
  visualContext.textBaseline = 'middle';
  orderedCandidates.forEach((candidate) => {
    if (placedLabels.length >= maxLabels) {
      return;
    }

    const label = compactNodeLabel(candidate.node.label);
    const fontSize = candidate.isPrimary ? 12.5 : 11;
    const alpha = clamp(candidate.amount, 0, 1);
    visualContext.font = `${candidate.isPrimary ? 700 : 600} ${fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif`;
    const metrics = visualContext.measureText(label);
    const horizontalPadding = candidate.isPrimary ? 9 : 7;
    const labelWidth = metrics.width + horizontalPadding * 2;
    const labelHeight = candidate.isPrimary ? 24 : 20;
    const preferredRight = candidate.point.x + candidate.radius + 10 + labelWidth < width - 10;
    const x = preferredRight
      ? candidate.point.x + candidate.radius + 10
      : candidate.point.x - candidate.radius - 10 - labelWidth;
    const y = clamp(candidate.point.y - candidate.radius - labelHeight * 0.35, 12, height - labelHeight - 12);
    const box = {
      x: clamp(x, 10, width - labelWidth - 10),
      y,
      width: labelWidth,
      height: labelHeight
    };

    if (placedLabels.some((placed) => rectanglesOverlap(placed, box))) {
      return;
    }
    placedLabels.push(box);

    visualContext.save();
    visualContext.globalAlpha = alpha;
    if (candidate.isPrimary) {
      visualContext.shadowColor = 'rgba(214, 226, 255, 0.18)';
      visualContext.shadowBlur = 12;
    }
    roundedRect(visualContext, box.x, box.y, box.width, box.height, 9);
    visualContext.fillStyle = candidate.isPrimary ? 'rgba(16, 20, 34, 0.82)' : 'rgba(10, 14, 25, 0.62)';
    visualContext.fill();
    visualContext.lineWidth = candidate.isPrimary ? 0.9 : 0.65;
    visualContext.strokeStyle = candidate.color;
    visualContext.globalAlpha = alpha * (candidate.isPrimary ? 0.62 : 0.38);
    visualContext.stroke();
    visualContext.globalAlpha = alpha * (candidate.isPrimary ? 0.96 : 0.72);
    visualContext.fillStyle = candidate.isPrimary ? '#eef3ff' : '#c4ccdc';
    visualContext.fillText(label, box.x + horizontalPadding, box.y + box.height / 2);
    visualContext.restore();
  });
  visualContext.restore();
}

function cachedOverlayEdges(cacheKey, entries) {
  const key = `${state.visualRevision}:${cacheKey}`;
  if (state.overlayCache.key === key) {
    return state.overlayCache.edges;
  }
  const highlightedEdges = [];
  entries.forEach((entry) => {
    const source = state.projectedPoints.get(entry.edge.source);
    const target = state.projectedPoints.get(entry.edge.target);
    if (!source || !target) {
      return;
    }
    const highlightedPath = new Path2D();
    addCurvedEdge(highlightedPath, entry.edge, source, target, entry.strength ?? 1);
    highlightedEdges.push({
      path: highlightedPath,
      color: entry.color,
      intensity: entry.intensity
    });
  });
  state.overlayCache = { key, edges: highlightedEdges };
  return highlightedEdges;
}

function buildHighlightedEdges(hoverTrails, edgeTrails, width, height) {
  const highlightedEdges = [];
  const seenEdges = new Set();
  if (state.pathMode) {
    if (state.pathOrderedEdgeIds.length) {
      return cachedOverlayEdges(
        `path:${state.activePathVariantId}:${state.pathOrderedEdgeIds.join('|')}`,
        pathOverlayEdges().map((edge, index) => ({
          edge,
          color: index === 0 ? '#f6f8ff' : '#aebdff',
          intensity: 1,
          strength: 1.04
        }))
      );
    }
    return highlightedEdges;
  }
  if (state.focusMode && state.focusEdgeIds.size) {
    const edges = focusOverlayEdges();
    return cachedOverlayEdges(
      `focus:${state.focusNodeId}:${state.focusDepth}:${edges.map((edge) => edge.id).join('|')}`,
      edges.map((edge) => ({
        edge,
        color: colorForEdge(edge),
        intensity: edge.source === state.focusNodeId || edge.target === state.focusNodeId ? 1 : 0.56
      }))
    );
  }
  if (state.communitySpotlightName && state.communitySpotlightEdgeIds.size) {
    const edges = communitySpotlightOverlayEdges();
    return cachedOverlayEdges(
      `community:${state.communitySpotlightName}:${edges.map((edge) => edge.id).join('|')}`,
      edges.map((edge) => ({
        edge,
        color: colorForCommunity(state.communitySpotlightName),
        intensity: 0.64,
        strength: 0.9
      }))
    );
  }
  if (state.recentOrbitMode && state.recentOrbitPathEdgeIds.size) {
    return cachedOverlayEdges(
      `recent:${state.recentOrbitActiveNodeId}:${state.recentOrbitTargetNodeId}:${state.recentOrbitOrderedEdgeIds.join('|')}`,
      recentOrbitOverlayEdges().map((edge, index) => ({
        edge,
        color: index === 0 ? '#f4f7ff' : '#9dd8ca',
        intensity: 0.82
      }))
    );
  }
  if (state.graphStoryMode && state.graphStoryEdgeIds.size) {
    const edges = graphStoryOverlayEdges();
    return cachedOverlayEdges(
      `story:${state.graphStoryStepIndex}:${edges.map((edge) => edge.id).join('|')}`,
      edges.map((edge) => ({
        edge,
        color: state.graphStoryActiveCommunityName ? colorForCommunity(state.graphStoryActiveCommunityName) : '#d8e6ff',
        intensity: 0.7,
        strength: 0.94
      }))
    );
  }
  if (state.searchRevealNodeId && state.searchRevealEdgeIds.size) {
    const edges = searchRevealOverlayEdges();
    return cachedOverlayEdges(
      `search:${state.searchRevealNodeId}:${edges.map((edge) => edge.id).join('|')}`,
      edges.map((edge) => ({
        edge,
        color: accentColorForCommunity(nodeForId(state.searchRevealNodeId)?.community ?? ''),
        intensity: 0.78
      }))
    );
  }
  if (state.selectedNode) {
    const linkedEdges = state.edgesByNode.get(state.selectedNode.id) ?? [];
    return cachedOverlayEdges(
      `selected:${state.selectedNode.id}:${linkedEdges.map((edge) => edge.id).join('|')}`,
      linkedEdges.map((edge) => ({
        edge,
        color: accentColorForCommunity(state.selectedNode.community),
        intensity: 1
      }))
    );
  }
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
  edgeTrails.forEach((trail) => {
    if (trail.intensity <= 0.02 || seenEdges.has(trail.edge.id)) {
      return;
    }
    const source = state.projectedPoints.get(trail.edge.source);
    const target = state.projectedPoints.get(trail.edge.target);
    if (!source || !target) {
      return;
    }
    const highlightedPath = new Path2D();
    addCurvedEdge(
      highlightedPath,
      trail.edge,
      ambientProjectedPoint(source, width, height),
      ambientProjectedPoint(target, width, height),
      1
    );
    highlightedEdges.push({
      path: highlightedPath,
      color: colorForEdge(trail.edge),
      intensity: smoothstep(trail.intensity)
    });
    seenEdges.add(trail.edge.id);
  });
  return highlightedEdges;
}

function pathOverlayEdges() {
  return state.pathOrderedEdgeIds
    .map((edgeId) => state.edgeById.get(edgeId))
    .filter(Boolean);
}

function pathEdgeRenderSegment(edge, index, width, height) {
  const renderedSource = state.projectedPoints.get(edge.source);
  const renderedTarget = state.projectedPoints.get(edge.target);
  if (!renderedSource || !renderedTarget) {
    return null;
  }
  const pathFrom = state.pathOrderedNodeIds[index];
  const pathTo = state.pathOrderedNodeIds[index + 1];
  return {
    sourcePoint: ambientProjectedPoint(renderedSource, width, height),
    targetPoint: ambientProjectedPoint(renderedTarget, width, height),
    reverse: edge.source === pathTo && edge.target === pathFrom
  };
}

function drawPathPulseOverlay(width, height) {
  if (!state.pathMode || !state.pathOrderedEdgeIds.length) {
    return;
  }
  const phase = prefersReducedMotion ? 0.5 : state.pathPulsePhase;
  visualContext.save();
  state.pathOrderedEdgeIds.forEach((edgeId, index) => {
    const edge = state.edgeById.get(edgeId);
    if (!edge) {
      return;
    }
    const segment = pathEdgeRenderSegment(edge, index, width, height);
    if (!segment) {
      return;
    }
    const control = curvedEdgeControl(edge, segment.sourcePoint, segment.targetPoint, 1.04);
    const pathT = prefersReducedMotion ? 0.5 : ((phase * 0.82 + index * 0.18) % 1);
    const pulseT = segment.reverse ? 1 - pathT : pathT;
    const pulse = pointOnQuadratic(segment.sourcePoint, control, segment.targetPoint, pulseT);
    const radius = prefersReducedMotion ? 3.4 : 3.2 + Math.sin((phase + index) * 3.2) * 0.8;
    visualContext.beginPath();
    visualContext.arc(pulse.x, pulse.y, radius + 4.5, 0, Math.PI * 2);
    visualContext.fillStyle = '#dfe8ff';
    visualContext.globalAlpha = prefersReducedMotion ? 0.16 : 0.18;
    visualContext.shadowColor = 'rgba(214, 226, 255, 0.5)';
    visualContext.shadowBlur = prefersReducedMotion ? 8 : 14;
    visualContext.fill();
    visualContext.beginPath();
    visualContext.arc(pulse.x, pulse.y, radius, 0, Math.PI * 2);
    visualContext.fillStyle = '#f7f9ff';
    visualContext.globalAlpha = 0.88;
    visualContext.fill();
  });
  visualContext.restore();
}

function drawLivingPulses(width, height) {
  if (!state.livingPulseEvents.length) {
    state.performanceStats.livingPulseCount = 0;
    return;
  }
  const now = performance.now();
  state.livingPulseEvents = pruneLivingPulses(state.livingPulseEvents, now, {
    reducedMotion: prefersReducedMotion
  });
  state.performanceStats.livingPulseCount = state.livingPulseEvents.length;
  if (!state.livingPulseEvents.length || prefersReducedMotion) {
    return;
  }

  visualContext.save();
  state.livingPulseEvents.forEach((pulse) => {
    const visual = pulseVisualState(pulse, now);
    if (visual.expired || visual.alpha <= 0.01) {
      return;
    }
    const origin = pulse.originNodeId ? nodeForId(pulse.originNodeId) : null;
    const pulseColor = origin ? accentColorForCommunity(origin.community) : '#dbe7ff';

    visualContext.lineCap = 'round';
    visualContext.lineJoin = 'round';
    visualContext.shadowColor = 'rgba(210, 226, 255, 0.24)';
    visualContext.shadowBlur = 12 * visual.alpha;
    visualContext.lineWidth = 0.8 + visual.alpha * 1.4;
    visualContext.strokeStyle = pulseColor;
    visualContext.globalAlpha = 0.08 + visual.alpha * 0.22;
    pulse.edgeIds.forEach((edgeId) => {
      const edge = state.edgeById.get(edgeId);
      const source = edge ? state.projectedPoints.get(edge.source) : null;
      const target = edge ? state.projectedPoints.get(edge.target) : null;
      if (!edge || !source || !target) {
        return;
      }
      const path = new Path2D();
      addCurvedEdge(path, edge, ambientProjectedPoint(source, width, height), ambientProjectedPoint(target, width, height), 0.94);
      visualContext.stroke(path);
    });

    pulse.nodeIds.forEach((nodeId) => {
      const node = nodeForId(nodeId);
      const rawPoint = state.projectedPoints.get(nodeId);
      if (!node || !rawPoint) {
        return;
      }
      const point = ambientProjectedPoint(rawPoint, width, height);
      const degree = state.degreeByNode.get(node.id) ?? 0;
      const depth = depthPresence(point.z);
      const baseRadius = nodeRadiusForDegree(degree, depth);
      const radius = baseRadius + 3.2 * visual.radiusScale;
      visualContext.beginPath();
      visualContext.arc(point.x, point.y, radius, 0, Math.PI * 2);
      visualContext.fillStyle = accentColorForCommunity(node.community);
      visualContext.globalAlpha = 0.04 + visual.alpha * 0.12;
      visualContext.fill();
      visualContext.beginPath();
      visualContext.arc(point.x, point.y, baseRadius + visual.radiusScale * 1.8, 0, Math.PI * 2);
      visualContext.strokeStyle = selectedStrokeColor;
      visualContext.globalAlpha = 0.14 + visual.alpha * 0.34;
      visualContext.lineWidth = 0.9 + visual.alpha * 0.8;
      visualContext.stroke();
    });
  });
  visualContext.restore();
}

function focusOverlayEdges() {
  const directEdges = [];
  const otherEdges = [];
  state.focusEdgeIds.forEach((edgeId) => {
    const edge = state.edgeById.get(edgeId);
    if (!edge) {
      return;
    }
    if (edge.source === state.focusNodeId || edge.target === state.focusNodeId) {
      directEdges.push(edge);
    } else {
      otherEdges.push(edge);
    }
  });
  return directEdges.concat(otherEdges).slice(0, 720);
}

function communitySpotlightOverlayEdges() {
  const directEdges = [];
  const bridgeEdges = [];
  state.communitySpotlightOverlayEdgeIds.forEach((edgeId) => {
    const edge = state.edgeById.get(edgeId);
    if (!edge) {
      return;
    }
    if (state.communitySpotlightNodeIds.has(edge.source) && state.communitySpotlightNodeIds.has(edge.target)) {
      directEdges.push(edge);
    } else {
      bridgeEdges.push(edge);
    }
  });
  return directEdges.concat(bridgeEdges).slice(0, 720);
}

function recentOrbitOverlayEdges() {
  return state.recentOrbitOrderedEdgeIds
    .map((edgeId) => state.edgeById.get(edgeId))
    .filter(Boolean);
}

function graphStoryOverlayEdges() {
  return Array.from(state.graphStoryEdgeIds)
    .map((edgeId) => state.edgeById.get(edgeId))
    .filter(Boolean)
    .slice(0, graphStoryEdgeLimit);
}

function searchRevealOverlayEdges() {
  return Array.from(state.searchRevealEdgeIds)
    .map((edgeId) => state.edgeById.get(edgeId))
    .filter(Boolean)
    .slice(0, searchRevealNeighborLimit);
}

function addCurvedEdge(path, edge, source, target, strength = 1) {
  const control = curvedEdgeControl(edge, source, target, strength);
  path.moveTo(source.x, source.y);
  path.quadraticCurveTo(control.x, control.y, target.x, target.y);
}

function curvedEdgeControl(edge, source, target, strength = 1) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.max(Math.hypot(dx, dy), 0.001);
  const bendSeed = hashString(edge.id || `${edge.source}:${edge.target}`);
  const sign = bendSeed % 2 === 0 ? 1 : -1;
  const bend = clamp(length * 0.075, 4, 34) * strength * sign;
  return {
    x: (source.x + target.x) / 2 + (-dy / length) * bend,
    y: (source.y + target.y) / 2 + (dx / length) * bend
  };
}

function depthPresence(projectedZ) {
  const distance = clamp((projectedZ + 1) / 2, 0, 1);
  return clamp(0.98 - distance * 0.2, 0.78, 0.98);
}

function nodeRadiusForDegree(degree, depth = 1) {
  return clamp(1.65 + Math.log1p(degree) * 0.9 + Math.sqrt(Math.max(degree, 0)) * 0.12, 1.65, 8.8) * depth;
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
  return {
    ...point,
    x: point.x + Math.cos(phase * 0.88) * amplitude,
    y: point.y + Math.sin(phase * 0.7 + (seed % 97) * 0.013) * amplitude * 0.72
  };
}

function updateHoverTrails() {
  const hoveredNode = state.selectedNode ? null : state.hoveredNode;
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

function updateEdgeTrails() {
  const hoveredEdge = state.selectedNode ? null : state.hoveredEdge;
  if (hoveredEdge) {
    const current = state.edgeTrails.get(hoveredEdge.id);
    state.edgeTrails.set(hoveredEdge.id, {
      edge: hoveredEdge,
      intensity: current?.intensity ?? 0
    });
  }

  state.edgeTrails.forEach((trail, edgeId) => {
    const target = hoveredEdge?.id === edgeId ? 1 : 0;
    const speed = target > trail.intensity ? 0.22 : 0.08;
    trail.intensity += (target - trail.intensity) * speed;
    if (target === 0 && trail.intensity < 0.025) {
      state.edgeTrails.delete(edgeId);
    }
  });

  return Array.from(state.edgeTrails.values());
}

function buildNodeFocusMap(hoverTrails, edgeTrails) {
  const focus = new Map();
  if (state.pathMode) {
    if (state.pathNodeIds.size) {
      state.pathOrderedNodeIds.forEach((nodeId, index) => {
        const isEndpoint = index === 0 || index === state.pathOrderedNodeIds.length - 1;
        mergeNodeFocus(focus, nodeId, isEndpoint ? 1 : 0, isEndpoint ? 0 : 0.74);
      });
    } else {
      if (state.pathSourceId) {
        mergeNodeFocus(focus, state.pathSourceId, 1, 0);
      }
      if (state.pathTargetId) {
        mergeNodeFocus(focus, state.pathTargetId, 0.76, 0);
      }
    }
    return focus;
  }
  if (state.focusMode && state.focusNodeIds.size) {
    state.focusNodeIds.forEach((nodeId) => {
      const distance = state.focusNodeDistance.get(nodeId) ?? state.focusDepth;
      if (distance === 0) {
        mergeNodeFocus(focus, nodeId, 1, 0);
      } else {
        const neighborStrength = clamp(0.9 - (distance - 1) * 0.22, 0.36, 0.9);
        mergeNodeFocus(focus, nodeId, 0, neighborStrength);
      }
    });
    return focus;
  }
  if (state.communitySpotlightName && state.communitySpotlightNodeIds.size) {
    const focusNodeIds = state.communitySpotlightFocusNodeIds.size
      ? state.communitySpotlightFocusNodeIds
      : state.communitySpotlightNodeIds;
    focusNodeIds.forEach((nodeId) => {
      const node = nodeForId(nodeId);
      const degree = node ? degreeForNode(node.id) : 0;
      const amount = clamp(0.42 + Math.log1p(degree) * 0.08, 0.42, 0.82);
      mergeNodeFocus(focus, nodeId, state.selectedNode?.id === nodeId ? 1 : 0, amount);
    });
    return focus;
  }
  if (state.recentOrbitMode && state.recentOrbitNodeIds.size) {
    state.recentOrbitNodeIds.forEach((nodeId) => {
      const isActive = state.recentOrbitActiveNodeId === nodeId;
      const isTarget = state.recentOrbitTargetNodeId === nodeId;
      const isPath = state.recentOrbitPathNodeIds.has(nodeId);
      mergeNodeFocus(focus, nodeId, isActive || isTarget ? 1 : 0, isPath ? 0.82 : 0.58);
    });
    if (state.recentOrbitTargetNodeId) {
      mergeNodeFocus(focus, state.recentOrbitTargetNodeId, 0.9, 0);
    }
    state.recentOrbitPathNodeIds.forEach((nodeId) => {
      mergeNodeFocus(focus, nodeId, state.recentOrbitActiveNodeId === nodeId ? 1 : 0, 0.76);
    });
    return focus;
  }
  if (state.graphStoryMode && state.graphStoryNodeIds.size) {
    const focusNodeIds = state.graphStoryFocusNodeIds.size
      ? state.graphStoryFocusNodeIds
      : state.graphStoryNodeIds;
    focusNodeIds.forEach((nodeId) => {
      const node = nodeForId(nodeId);
      const degree = node ? degreeForNode(node.id) : 0;
      const isActive = state.graphStoryActiveNodeId === nodeId;
      const amount = clamp(0.48 + Math.log1p(degree) * 0.08, 0.48, 0.86);
      mergeNodeFocus(focus, nodeId, isActive ? 1 : 0, amount);
    });
    return focus;
  }
  if (state.searchRevealNodeId) {
    mergeNodeFocus(focus, state.searchRevealNodeId, 1, 0);
    state.searchRevealNeighborIds.forEach((nodeId) => {
      mergeNodeFocus(focus, nodeId, 0, 0.72);
    });
    return focus;
  }
  if (state.selectedNode) {
    mergeNodeFocus(focus, state.selectedNode.id, 1, 0);
    const neighbors = state.adjacencyByNode.get(state.selectedNode.id) ?? new Set();
    neighbors.forEach((neighborId) => {
      mergeNodeFocus(focus, neighborId, 0, 0.78);
    });
    return focus;
  }
  hoverTrails.forEach((trail) => {
    mergeNodeFocus(focus, trail.node.id, trail.intensity, 0);
    const neighbors = state.adjacencyByNode.get(trail.node.id) ?? new Set();
    neighbors.forEach((neighborId) => {
      mergeNodeFocus(focus, neighborId, 0, trail.intensity * 0.78);
    });
  });
  edgeTrails.forEach((trail) => {
    mergeNodeFocus(focus, trail.edge.source, 0, trail.intensity);
    mergeNodeFocus(focus, trail.edge.target, 0, trail.intensity);
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
  const target = state.hoveredNode || state.hoveredEdge ? 1 : 0;
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
  state.visualRevision += 1;
  state.projectedPointGrid = null;
  state.overlayCache = { key: '', edges: [] };
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
    nodeInfo.innerHTML = state.communitySpotlightName
      ? renderCommunitySpotlightPanel()
      : state.recentOrbitMode
      ? renderRecentOrbitPanel()
      : state.graphStoryMode
      ? renderGraphStoryPanel()
      : `${renderGraphStoryEntry()}${renderRecentOrbitEntry()}<p class="muted italic">Click a node to inspect it</p>`;
    wireCommunitySpotlightPanel();
    wireRecentOrbitPanel();
    wireGraphStoryPanel();
    return;
  }

  const source = node.sourceFile || '';
  const sourceButton = source
    ? '<button class="primary-button" id="open-note">Open Note</button>'
    : '';
  const isFocused = state.focusMode && state.focusNodeId === node.id;
  const focusStatus = state.focusMode
    ? `<p class="focus-status">Focused · depth ${state.focusDepth} · ${state.focusNodeIds.size} notes</p>`
    : '';
  const pathStatus = state.pathMode && !state.pathTargetId && state.pathSourceId
    ? '<p class="focus-status">Path source set · click another node to trace</p>'
    : '';
  const revealStatus = state.searchRevealNodeId === node.id
    ? `<p class="focus-status">Revealed from search · ${state.searchRevealNeighborIds.size} visible neighbors</p>`
    : '';
  const topNeighbors = topNeighborsForNode(node.id, 12);
  nodeInfo.innerHTML = `
    <h3>${escapeHTML(node.label)}</h3>
    ${sourceButton}
    <div class="focus-actions">
      <button id="focus-orbit" class="${isFocused ? 'selected' : ''}">Focus</button>
      <button data-depth="1" ${state.focusDepth === 1 && isFocused ? 'class="selected"' : ''}>Depth 1</button>
      <button data-depth="2" ${state.focusDepth === 2 && isFocused ? 'class="selected"' : ''}>Depth 2</button>
      <button data-depth="3" ${state.focusDepth === 3 && isFocused ? 'class="selected"' : ''}>Depth 3</button>
      <button id="back-to-all" ${state.focusMode || state.pathMode || state.recentOrbitMode || state.graphStoryMode || state.searchRevealNodeId ? '' : 'disabled'}>Back to all</button>
    </div>
    <div class="path-actions">
      <button id="start-path" class="${state.pathSourceId === node.id && !state.pathTargetId ? 'selected' : ''}">Start path</button>
      <button id="clear-path" ${state.pathMode ? '' : 'disabled'}>Clear path</button>
    </div>
    ${focusStatus}
    ${pathStatus}
    ${revealStatus}
    ${state.communitySpotlightName ? renderCommunitySpotlightPanel() : ''}
    ${state.recentOrbitMode ? renderRecentOrbitPanel() : ''}
    ${state.graphStoryMode ? renderGraphStoryPanel() : ''}
    ${renderPathPanel()}
    <p><strong>Type:</strong> ${escapeHTML(node.type ?? node.file_type ?? 'document')}</p>
    <p><strong>Community:</strong> ${escapeHTML(node.community)}</p>
    ${source ? `<p><strong>Source:</strong> ${escapeHTML(source)}</p>` : ''}
    <p><strong>Degree:</strong> ${degreeForNode(node.id)}</p>
    <h4>Top neighbors</h4>
    <div class="neighbor-list">
      ${topNeighbors.length
        ? topNeighbors.map((neighbor) => `<button class="neighbor-button" data-node-id="${escapeHTML(neighbor.id)}">${escapeHTML(neighbor.label)}<span>${neighbor.degree}</span></button>`).join('')
        : '<p class="muted">No neighbors in this view.</p>'}
    </div>
  `;

  const button = document.getElementById('open-note');
  if (button) {
    button.addEventListener('click', () => sendNodeAction('openNode', node));
  }
  document.getElementById('focus-orbit')?.addEventListener('click', () => applyFocusOrbit(node, state.focusDepth || 1));
  nodeInfo.querySelectorAll('button[data-depth]').forEach((depthButton) => {
    depthButton.addEventListener('click', () => {
      const depth = Number(depthButton.dataset.depth) || 1;
      applyFocusOrbit(node, depth, depth === 1 || !state.focusMode);
    });
  });
  document.getElementById('back-to-all')?.addEventListener('click', () => backToAll());
  document.getElementById('start-path')?.addEventListener('click', () => armPathSource(node));
  document.getElementById('clear-path')?.addEventListener('click', () => clearPathMode(true));
  wireCommunitySpotlightPanel();
  wireRecentOrbitPanel();
  wireGraphStoryPanel();
  nodeInfo.querySelectorAll('.path-step[data-node-id]').forEach((pathButton) => {
    pathButton.addEventListener('click', () => {
      const pathNode = nodeForId(pathButton.dataset.nodeId);
      if (pathNode) {
        selectNode(pathNode, true, { preservePath: true });
      }
    });
  });
  nodeInfo.querySelectorAll('.path-variant[data-variant-id]').forEach((variantButton) => {
    variantButton.addEventListener('click', () => applyPathVariant(variantButton.dataset.variantId));
  });
  nodeInfo.querySelectorAll('.neighbor-button[data-node-id]').forEach((neighborButton) => {
    neighborButton.addEventListener('click', () => {
      const neighbor = nodeForId(neighborButton.dataset.nodeId);
      if (neighbor) {
        if (state.pathMode && state.pathSourceId && !state.pathTargetId) {
          applyPathToNode(neighbor);
        } else {
          applyFocusOrbit(neighbor, state.focusMode ? state.focusDepth : 1);
        }
      }
    });
  });
}

function renderCommunitySpotlightPanel() {
  const spotlight = state.communitySpotlightSummary;
  if (!spotlight) {
    return '';
  }
  const topButtons = spotlight.topNodes.map((item, index) => `
    <button class="spotlight-node" data-node-id="${escapeHTML(item.id)}">
      <span>${index + 1}</span>${escapeHTML(item.label)}<small>${item.degree}</small>
    </button>
  `).join('');
  const bridgeButtons = spotlight.bridgeNodes.map((item) => `
    <button class="spotlight-node" data-node-id="${escapeHTML(item.id)}">
      <span>*</span>${escapeHTML(item.label)}<small>${item.bridgeCount} bridge ${item.bridgeCount === 1 ? 'edge' : 'edges'}</small>
    </button>
  `).join('');
  return `
    <section class="spotlight-panel">
      <div class="spotlight-heading">
        <div>
          <h4>Community Spotlight</h4>
          <p>${escapeHTML(spotlight.name)} · ${spotlight.nodeCount} notes · ${spotlight.edgeCount} internal edges</p>
        </div>
        <button id="clear-spotlight">Clear</button>
      </div>
      <p class="spotlight-summary">${escapeHTML(spotlight.summary)}</p>
      <h5>Top notes</h5>
      <div class="spotlight-list">${topButtons || '<p class="muted">No notes in this community.</p>'}</div>
      <h5>Bridge notes</h5>
      <div class="spotlight-list">${bridgeButtons || '<p class="muted">No visible bridge notes.</p>'}</div>
    </section>
  `;
}

function wireCommunitySpotlightPanel() {
  document.getElementById('clear-spotlight')?.addEventListener('click', () => clearCommunitySpotlight(true));
  nodeInfo.querySelectorAll('.spotlight-node[data-node-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const node = nodeForId(button.dataset.nodeId);
      if (node) {
        selectNode(node, true, { preserveCommunitySpotlight: true });
      }
    });
  });
}

function renderRecentOrbitEntry() {
  const items = recentOrbitVisibleItems(recentOrbitNodeLimit);
  if (!items.length) {
    return '';
  }
  return `
    <section class="recent-orbit-entry">
      <button class="primary-button" id="start-recent-orbit">Recent Orbit</button>
      <p class="muted">${items.length} recently changed or date-named notes in this view.</p>
    </section>
  `;
}

function renderRecentOrbitPanel() {
  const items = state.recentOrbitItems.length
    ? state.recentOrbitItems
    : recentOrbitVisibleItems(recentOrbitNodeLimit);
  const activeNode = nodeForId(state.recentOrbitActiveNodeId);
  const targetNode = nodeForId(state.recentOrbitTargetNodeId);
  const pathText = targetNode && state.recentOrbitOrderedNodeIds.length
    ? `${Math.max(state.recentOrbitOrderedNodeIds.length - 1, 0)} steps to ${targetNode.label}`
    : state.recentOrbitMessage || 'No visible path to a key note in current view';
  const itemButtons = items.slice(0, recentOrbitPanelLimit).map((item, index) => `
    <button class="recent-orbit-node ${item.id === state.recentOrbitActiveNodeId ? 'selected' : ''}" data-node-id="${escapeHTML(item.id)}">
      <span>${index + 1}</span>
      <strong>${escapeHTML(item.label)}</strong>
      <small>${escapeHTML(formatRecentTimestamp(item.timestamp))}</small>
    </button>
  `).join('');

  return `
    <section class="recent-orbit-panel">
      <div class="recent-orbit-heading">
        <div>
          <h4>Recent Orbit</h4>
          <p>${items.length} recent notes · ${escapeHTML(activeNode?.label || 'No active note')}</p>
        </div>
        <button id="clear-recent-orbit">Back to all</button>
      </div>
      <p class="recent-orbit-summary">${escapeHTML(pathText)}</p>
      <div class="recent-orbit-list">${itemButtons || '<p class="muted">No recent metadata in current view.</p>'}</div>
    </section>
  `;
}

function wireRecentOrbitPanel() {
  document.getElementById('start-recent-orbit')?.addEventListener('click', () => applyRecentOrbit());
  document.getElementById('clear-recent-orbit')?.addEventListener('click', () => clearRecentOrbit(true));
  nodeInfo.querySelectorAll('.recent-orbit-node[data-node-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const node = nodeForId(button.dataset.nodeId);
      if (node) {
        applyRecentOrbit(node.id, true);
      }
    });
  });
}

function renderGraphStoryEntry() {
  const steps = graphStoryVisibleSteps();
  if (!steps.length) {
    return '';
  }
  return `
    <section class="graph-story-entry">
      <button class="primary-button" id="start-graph-story">Graph Story</button>
      <p class="muted">${steps.length} guided steps through this visible graph.</p>
    </section>
  `;
}

function renderGraphStoryPanel() {
  const step = currentGraphStoryStep();
  if (!step) {
    return `
      <section class="graph-story-panel">
        <div class="graph-story-heading">
          <div>
            <h4>Graph Story</h4>
            <p>No story steps in current view.</p>
          </div>
          <button id="clear-graph-story">Exit tour</button>
        </div>
      </section>
    `;
  }
  const canGoBack = state.graphStoryStepIndex > 0;
  const canGoNext = state.graphStoryStepIndex < state.graphStorySteps.length - 1;
  const story = graphStoryPresentation(step, {
    stepIndex: state.graphStoryStepIndex,
    totalSteps: state.graphStorySteps.length,
    activeNodeId: state.graphStoryActiveNodeId,
    previewLimit: graphStoryPreviewLimit
  });
  const activeNode = story.primary?.id ? nodeForId(story.primary.id) : null;
  const openDisabled = activeNode?.sourceFile ? '' : 'disabled';
  const focusDisabled = activeNode ? '' : 'disabled';
  const primaryButton = story.primary
    ? `<button class="graph-story-primary-node" data-node-id="${escapeHTML(story.primary.id)}">
        <span>Start here</span>
        <strong>${escapeHTML(story.primary.label)}</strong>
        <small>${escapeHTML(story.primary.detail || '')}</small>
      </button>`
    : '<p class="muted">No primary note for this step.</p>';
  const supportingButtons = story.supportingItems.map((item) => `
    <button class="graph-story-support-node" data-node-id="${escapeHTML(item.id)}">
      <strong>${escapeHTML(item.label)}</strong>
      <small>${escapeHTML(item.detail || '')}</small>
    </button>
  `).join('');
  return `
    <section class="graph-story-panel">
      <div class="graph-story-heading">
        <div>
          <h4>Graph Story</h4>
          <p>${escapeHTML(story.eyebrow)}</p>
        </div>
        <button id="clear-graph-story">Exit tour</button>
      </div>
      <div class="graph-story-copy">
        <h3>${escapeHTML(story.title)}</h3>
        <p>${escapeHTML(story.summary || state.graphStoryMessage || '')}</p>
        <p class="graph-story-takeaway">${escapeHTML(story.takeaway)}</p>
      </div>
      <div class="graph-story-primary">${primaryButton}</div>
      <div class="graph-story-actions">
        <button id="graph-story-focus-note" ${focusDisabled}>Focus note</button>
        <button id="graph-story-open-note" ${openDisabled}>Open note</button>
      </div>
      <div class="graph-story-controls">
        <button id="graph-story-back" ${canGoBack ? '' : 'disabled'}>Back</button>
        <button id="graph-story-next" ${canGoNext ? '' : 'disabled'}>Next</button>
      </div>
      ${supportingButtons ? `<div class="graph-story-supporting"><h5>Also highlighted</h5>${supportingButtons}</div>` : ''}
    </section>
  `;
}

function wireGraphStoryPanel() {
  document.getElementById('start-graph-story')?.addEventListener('click', () => startGraphStory());
  document.getElementById('clear-graph-story')?.addEventListener('click', () => clearGraphStory(true));
  document.getElementById('graph-story-back')?.addEventListener('click', () => applyGraphStoryStep(state.graphStoryStepIndex - 1));
  document.getElementById('graph-story-next')?.addEventListener('click', () => applyGraphStoryStep(state.graphStoryStepIndex + 1));
  document.getElementById('graph-story-focus-note')?.addEventListener('click', () => {
    const node = nodeForId(state.graphStoryActiveNodeId);
    if (node) {
      applyFocusOrbit(node, state.focusDepth || 1);
    }
  });
  document.getElementById('graph-story-open-note')?.addEventListener('click', () => {
    const node = nodeForId(state.graphStoryActiveNodeId);
    if (node) {
      sendNodeAction('openNode', node);
    }
  });
  nodeInfo.querySelectorAll('.graph-story-primary-node[data-node-id], .graph-story-support-node[data-node-id]').forEach((button) => {
    button.addEventListener('click', () => {
      activateGraphStoryNode(button.dataset.nodeId);
    });
  });
}

function renderPathPanel() {
  if (!state.pathMode) {
    return '';
  }
  const source = nodeForId(state.pathSourceId);
  const target = nodeForId(state.pathTargetId);
  const activeVariant = activePathVariant();
  const hasPath = state.pathOrderedNodeIds.length > 0;
  const title = hasPath ? (activeVariant?.label || 'Shortest path') : 'Path';
  const summary = hasPath
    ? `${Math.max(state.pathOrderedNodeIds.length - 1, 0)} steps · ${escapeHTML(source?.label || 'Source')} → ${escapeHTML(target?.label || 'Target')}`
    : escapeHTML(state.pathMessage || 'Select target');
  const steps = state.pathOrderedNodeIds.slice(0, 9).map((nodeId, index) => {
    const node = nodeForId(nodeId);
    const label = node?.label || nodeId;
    return `<button class="path-step" data-node-id="${escapeHTML(nodeId)}"><span>${index + 1}</span>${escapeHTML(label)}</button>`;
  }).join('');
  const overflow = state.pathOrderedNodeIds.length > 9
    ? `<p class="muted">+${state.pathOrderedNodeIds.length - 9} more steps</p>`
    : '';
  const explanation = hasPath
    ? explainShortestPath({
        orderedNodeIds: state.pathOrderedNodeIds,
        orderedEdgeIds: state.pathOrderedEdgeIds,
        nodes: state.visibleNodes,
        edges: state.visibleEdges,
        lens: state.lens,
        degreeByNode: state.degreeByNode
      })
    : null;
  return `
    <section class="path-panel">
      <h4>${title}</h4>
      <p>${summary}</p>
      ${hasPath ? renderPathCompare(activeVariant) : renderNoPathHint(source, target)}
      ${steps ? `<div class="path-step-list">${steps}${overflow}</div>` : ''}
      ${renderPathExplanation(explanation)}
    </section>
  `;
}

function renderPathCompare(activeVariant) {
  if (!state.pathTargetId || state.pathVariants.length <= 1 || !state.pathVariants.some((variant) => variant.found)) {
    return '';
  }
  const buttons = state.pathVariants.map((variant) => {
    const classes = ['path-variant'];
    if (variant.id === activeVariant?.id) {
      classes.push('selected');
    }
    const disabled = variant.found && !variant.sameAs ? '' : 'disabled';
    const detail = variant.sameAs
      ? variant.message
      : variant.found
      ? `${variant.stepCount} ${variant.stepCount === 1 ? 'step' : 'steps'}`
      : variant.message;
    return `
      <button class="${classes.join(' ')}" data-variant-id="${escapeHTML(variant.id)}" ${disabled}>
        <span>${escapeHTML(variant.label)}</span>
        <small>${escapeHTML(detail)}</small>
      </button>
    `;
  }).join('');
  return `
    <div class="path-compare">
      <h5>Compare paths</h5>
      <div class="path-variant-list">${buttons}</div>
    </div>
  `;
}

function renderNoPathHint(source, target) {
  if (!target) {
    return '';
  }
  const sourceDegree = source ? degreeForNode(source.id) : 0;
  const targetDegree = target ? degreeForNode(target.id) : 0;
  const lensName = state.lens === 'all' ? 'All' : (state.lens === 'graphify' ? 'Graphify' : 'Wikilinks');
  const reason = state.lens === 'all'
    ? 'These notes appear to live in different disconnected groups of the visible graph.'
    : `The ${lensName} view may be hiding the bridge between these notes.`;
  return `
    <div class="path-empty">
      <h5>No route found</h5>
      <p>${escapeHTML(reason)}</p>
      <ul>
        <li>${escapeHTML(source?.label || 'Source')} has ${sourceDegree} visible ${sourceDegree === 1 ? 'connection' : 'connections'}.</li>
        <li>${escapeHTML(target.label || 'Target')} has ${targetDegree} visible ${targetDegree === 1 ? 'connection' : 'connections'}.</li>
        <li>Try a direct neighbor, switch lens, or return to All before tracing again.</li>
      </ul>
    </div>
  `;
}

function renderPathExplanation(explanation) {
  if (!explanation) {
    return '';
  }
  const badges = explanation.badges?.length
    ? `<div class="path-explain-badges">${explanation.badges.map((badge) => `<span>${escapeHTML(badge)}</span>`).join('')}</div>`
    : '';
  const bullets = explanation.bullets?.length
    ? `<ul>${explanation.bullets.map((bullet) => `<li>${escapeHTML(bullet)}</li>`).join('')}</ul>`
    : '';
  const caveat = explanation.caveat
    ? `<p class="muted">${escapeHTML(explanation.caveat)}</p>`
    : '';
  return `
    <div class="path-explanation">
      <h5>${escapeHTML(explanation.title || 'Why this path')}</h5>
      <p>${escapeHTML(explanation.summary || '')}</p>
      ${badges}
      ${bullets}
      ${caveat}
    </div>
  `;
}

function topNeighborsForNode(nodeId, limit = 12) {
  const edges = state.edgesByNode.get(nodeId) || [];
  const seen = new Set();
  return edges
    .map((edge) => edge.source === nodeId ? edge.target : edge.source)
    .filter((neighborId) => {
      if (seen.has(neighborId)) {
        return false;
      }
      seen.add(neighborId);
      return true;
    })
    .map((neighborId) => nodeForId(neighborId))
    .filter(Boolean)
    .sort((left, right) => degreeForNode(right.id) - degreeForNode(left.id) || left.label.localeCompare(right.label))
    .slice(0, limit)
    .map((neighbor) => ({
      id: neighbor.id,
      label: neighbor.label,
      degree: degreeForNode(neighbor.id)
    }));
}

function renderLegend() {
  legend.innerHTML = '';
  state.communities.forEach((community) => {
    const row = document.createElement('div');
    row.className = `legend-item ${state.communitySpotlightName === community.name || state.graphStoryActiveCommunityName === community.name ? 'spotlighted' : ''}`;
    row.innerHTML = `
      <input type="checkbox" ${state.communityEnabled.has(community.name) ? 'checked' : ''}>
      <button class="legend-label community-spotlight-button" data-community-name="${escapeHTML(community.name)}"><span class="color-dot" style="background:${community.color}"></span> ${escapeHTML(community.name)}</button>
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
    row.querySelector('.community-spotlight-button')?.addEventListener('click', () => {
      if (state.communitySpotlightName === community.name) {
        clearCommunitySpotlight(true);
      } else {
        applyCommunitySpotlight(community.name);
      }
    });
    legend.appendChild(row);
  });
}

function renderStats() {
  const visibleCommunityCount = new Set(state.visibleNodes.map((node) => node.community)).size;
  stats.textContent = `${state.visibleNodes.length} nodes · ${state.visibleEdges.length} edges · ${visibleCommunityCount} communities`;
}

function renderSearchResults() {
  const query = search.value.trim();
  searchResults.innerHTML = '';
  if (!query) {
    state.searchResultIds = [];
    return;
  }
  const results = searchGraphNodes({
    query,
    nodes: state.visibleNodes,
    limit: searchResultLimit
  });
  state.searchResultIds = results.map((result) => result.id);
  results
    .forEach((result) => {
      const node = result.node;
      const button = document.createElement('button');
      button.className = 'search-item';
      button.innerHTML = `
        <span>${escapeHTML(node.label)}</span>
        ${result.sourceFile ? `<small>${escapeHTML(result.sourceFile)}</small>` : ''}
      `;
      button.addEventListener('click', () => handleSearchResultClick(node));
      searchResults.appendChild(button);
    });
}

function handleSearchResultClick(node) {
  if (!node) {
    return;
  }
  if (state.pathMode && state.pathSourceId && !state.pathTargetId && node.id !== state.pathSourceId) {
    selectNode(node, true);
    return;
  }
  revealSearchNode(node);
}

function updateOverlay() {
  if (!state.graph || state.graph.nodes.length === 0) {
    showOverlay('Graph data unavailable');
  } else if (state.lens === 'obsidian' && state.visibleEdges.length === 0) {
    showOverlay('No wikilinks found');
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
    : (state.lens === 'graphify' ? 'Graphify' : 'Wikilinks');
  const edgeLabel = state.lens === 'obsidian' ? 'links' : 'edges';
  const focusText = state.focusMode
    ? `Focused · depth ${state.focusDepth} · ${state.focusNodeIds.size} nodes`
    : '';
  const spotlightText = state.communitySpotlightName
    ? `Spotlight · ${state.communitySpotlightName} · ${state.communitySpotlightNodeIds.size} nodes`
    : '';
  const recentText = state.recentOrbitMode
    ? `Recent Orbit · ${state.recentOrbitNodeIds.size} recent · ${nodeForId(state.recentOrbitTargetNodeId)?.label || state.recentOrbitMessage || 'no visible key-note path'}`
    : '';
  const storyStep = currentGraphStoryStep();
  const storyText = state.graphStoryMode && storyStep
    ? `Graph Story · ${state.graphStoryStepIndex + 1}/${state.graphStorySteps.length} · ${storyStep.title}`
    : '';
  const searchRevealText = state.searchRevealNodeId
    ? `Revealed · ${nodeForId(state.searchRevealNodeId)?.label || 'Search result'}`
    : '';
  const pathText = pathHudText();
  const base = pathText
    ? `${pathText} · ${lensLabel} · 3D`
    : state.focusMode
    ? `${focusText} · ${lensLabel} · 3D`
    : state.communitySpotlightName
    ? `${spotlightText} · ${lensLabel} · 3D`
    : state.recentOrbitMode
    ? `${recentText} · ${lensLabel} · 3D`
    : state.graphStoryMode
    ? `${storyText || 'Graph Story'} · ${lensLabel} · 3D`
    : state.searchRevealNodeId
    ? `${searchRevealText} · ${lensLabel} · 3D`
    : `${lensLabel} · ${state.visibleNodes.length} nodes · ${state.visibleEdges.length} ${edgeLabel} · 3D`;
  const status = state.lastFrameStatus === 'Visible'
    ? ''
    : ` · ${state.cameraPreset} · ${state.lastFrameStatus}`;
  const nextText = state.lastDiagnostic ? `${base} · ${state.lastDiagnostic}` : `${base}${status}`;
  if (hud.textContent !== nextText) {
    hud.textContent = nextText;
  }
  hud.hidden = false;
}

function pathHudText() {
  if (!state.pathMode) {
    return '';
  }
  if (!state.pathTargetId) {
    return state.pathMessage || 'Path source set · click another node';
  }
  if (state.pathOrderedNodeIds.length) {
    const variant = activePathVariant();
    const label = variant?.id && variant.id !== 'shortest' ? `${variant.label} · ` : '';
    return `Path · ${label}${Math.max(state.pathOrderedNodeIds.length - 1, 0)} steps · ${state.pathOrderedNodeIds.length} nodes`;
  }
  return state.pathMessage || 'No visible path in current view';
}

function selectNode(node, focusCamera = false, options = {}) {
  if (state.pathMode && state.pathSourceId && !state.pathTargetId && !options.preservePath && node.id !== state.pathSourceId) {
    applyPathToNode(node);
    return;
  }
  if (!options.preserveSearchReveal) {
    clearSearchReveal(false);
  }
  state.selectedNode = node;
  renderNodeInfo(node);
  positionSelectedMarker(node);
  emitLivingPulse({
    ...pulseNodeNeighborhood(node.id, 10, 32),
    originNodeId: node.id,
    intensity: 0.52,
    durationMs: 920
  });
  if (focusCamera) {
    focusNode(node);
  }
  requestRender();
}

function revealSearchNode(node) {
  if (!node) {
    return;
  }
  clearInteractiveModes();

  const topNeighbors = topNeighborsForNode(node.id, searchRevealNeighborLimit);
  const neighborIds = new Set(topNeighbors.map((neighbor) => neighbor.id));
  const edgeIds = new Set();
  (state.edgesByNode.get(node.id) || []).forEach((edge) => {
    const otherId = edge.source === node.id ? edge.target : edge.source;
    if (neighborIds.has(otherId) && edgeIds.size < searchRevealNeighborLimit) {
      edgeIds.add(edge.id);
    }
  });

  state.searchRevealNodeId = node.id;
  state.searchRevealNeighborIds = neighborIds;
  state.searchRevealEdgeIds = edgeIds;
  state.selectedNode = node;
  renderNodeInfo(node);
  positionSelectedMarker(node);
  focusSearchReveal(node);
  emitLivingPulse({
    nodeIds: [node.id, ...neighborIds],
    edgeIds: edgeIds,
    originNodeId: node.id,
    intensity: 0.68,
    durationMs: 1050
  });
  updateHud();
  requestRender();
}

function clearSearchReveal(render = true) {
  state.searchRevealNodeId = null;
  state.searchRevealNeighborIds = new Set();
  state.searchRevealEdgeIds = new Set();
  if (render) {
    renderNodeInfo(state.selectedNode);
    updateHud();
    requestRender();
  }
}

function applyCommunitySpotlight(communityName) {
  const spotlight = computeCommunitySpotlight(communityName);
  if (!spotlight.nodeIds.size) {
    return;
  }
  clearInteractiveModes();
  state.communitySpotlightName = communityName;
  state.communitySpotlightNodeIds = spotlight.nodeIds;
  state.communitySpotlightEdgeIds = spotlight.edgeIds;
  state.communitySpotlightFocusNodeIds = spotlight.focusNodeIds;
  state.communitySpotlightOverlayEdgeIds = spotlight.overlayEdgeIds;
  state.communitySpotlightSummary = spotlight;
  state.selectedNode = null;
  selectedMarker.visible = false;
  renderSidebar();
  focusCommunitySpotlight(spotlight);
  emitLivingPulse({
    nodeIds: Array.from(spotlight.focusNodeIds),
    edgeIds: Array.from(spotlight.overlayEdgeIds),
    originNodeId: spotlight.topNodes[0]?.id || Array.from(spotlight.focusNodeIds)[0] || null,
    intensity: 0.50,
    durationMs: 1300
  });
  updateHud();
  requestRender();
}

function clearCommunitySpotlight(render = true) {
  state.communitySpotlightName = null;
  state.communitySpotlightNodeIds = new Set();
  state.communitySpotlightEdgeIds = new Set();
  state.communitySpotlightFocusNodeIds = new Set();
  state.communitySpotlightOverlayEdgeIds = new Set();
  state.communitySpotlightSummary = null;
  if (render) {
    renderSidebar();
    updateHud();
    requestRender();
  }
}

function computeCommunitySpotlight(communityName) {
  const cacheKey = `${state.visibleGraphRevision}:${communityName}`;
  const cached = state.spotlightCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const nodes = state.visibleNodes.filter((node) => node.community === communityName);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const internalEdges = [];
  const bridgeEdges = [];
  const bridgeCounts = new Map();
  const edgeIds = new Set();

  state.visibleEdges.forEach((edge) => {
    const sourceInside = nodeIds.has(edge.source);
    const targetInside = nodeIds.has(edge.target);
    if (sourceInside && targetInside) {
      internalEdges.push(edge);
      edgeIds.add(edge.id);
    } else if (sourceInside || targetInside) {
      const insideId = sourceInside ? edge.source : edge.target;
      bridgeCounts.set(insideId, (bridgeCounts.get(insideId) ?? 0) + 1);
      bridgeEdges.push(edge);
      edgeIds.add(edge.id);
    }
  });

  const rankedNodes = nodes
    .map((node) => ({
      id: node.id,
      label: node.label,
      degree: degreeForNode(node.id)
    }))
    .sort((left, right) => right.degree - left.degree || left.label.localeCompare(right.label));
  const topNodes = rankedNodes.slice(0, 8);
  const bridgeNodes = nodes
    .map((node) => ({
      id: node.id,
      label: node.label,
      degree: degreeForNode(node.id),
      bridgeCount: bridgeCounts.get(node.id) ?? 0
    }))
    .filter((node) => node.bridgeCount > 0)
    .sort((left, right) => right.bridgeCount - left.bridgeCount || right.degree - left.degree || left.label.localeCompare(right.label))
    .slice(0, 6);
  const pinnedFocusNodeIds = new Set([
    ...topNodes.map((node) => node.id),
    ...bridgeNodes.map((node) => node.id)
  ]);
  const budgets = spotlightBudgets(nodes.length, {
    largeThreshold: spotlightSmallCommunityLimit,
    smallFocusNodeLimit: spotlightFocusNodeLimit,
    smallInternalEdgeLimit: spotlightInternalEdgeLimit,
    smallBridgeEdgeLimit: spotlightBridgeEdgeLimit
  });
  const focusNodeIds = budgets.useAllNodes
    ? new Set(nodeIds)
    : new Set([
      ...pinnedFocusNodeIds,
      ...rankedNodes
        .map((node) => node.id)
        .filter((nodeId) => !pinnedFocusNodeIds.has(nodeId))
        .slice(0, Math.max(0, budgets.focusNodeLimit - pinnedFocusNodeIds.size))
    ]);
  const rankedInternalEdges = internalEdges
    .slice()
    .sort((left, right) => edgeImportanceScore(right, nodeIds, bridgeCounts) - edgeImportanceScore(left, nodeIds, bridgeCounts) || left.id.localeCompare(right.id))
    .slice(0, budgets.internalEdgeLimit);
  const rankedBridgeEdges = bridgeEdges
    .slice()
    .sort((left, right) => edgeImportanceScore(right, nodeIds, bridgeCounts) - edgeImportanceScore(left, nodeIds, bridgeCounts) || left.id.localeCompare(right.id))
    .slice(0, budgets.bridgeEdgeLimit);
  const overlayEdgeIds = new Set(rankedInternalEdges.concat(rankedBridgeEdges).map((edge) => edge.id));
  const topLabels = topNodes.slice(0, 3).map((node) => node.label).join(', ');
  const spotlight = {
    name: communityName,
    nodeIds,
    edgeIds,
    focusNodeIds,
    overlayEdgeIds,
    nodeCount: nodes.length,
    edgeCount: internalEdges.length,
    topNodes,
    bridgeNodes,
    summary: topLabels
      ? `This community is centered around ${topLabels}.`
      : 'This community is visible in the current graph view.'
  };
  state.spotlightCache.set(cacheKey, spotlight);
  return spotlight;
}

function edgeImportanceScore(edge, spotlightNodeIds, bridgeCounts) {
  const sourceInside = spotlightNodeIds.has(edge.source);
  const targetInside = spotlightNodeIds.has(edge.target);
  const sourceDegree = degreeForNode(edge.source);
  const targetDegree = degreeForNode(edge.target);
  const bridgeBoost = sourceInside !== targetInside ? 80 : 0;
  const sourceBridge = sourceInside ? (bridgeCounts.get(edge.source) ?? 0) : 0;
  const targetBridge = targetInside ? (bridgeCounts.get(edge.target) ?? 0) : 0;
  return bridgeBoost + sourceBridge * 4 + targetBridge * 4 + Math.log1p(sourceDegree) + Math.log1p(targetDegree);
}

function recentOrbitVisibleItems(limit = recentOrbitNodeLimit) {
  return recentOrbitCandidates({
    nodes: state.visibleNodes,
    metadata: window.__brainBarNodeFileMetadata || {},
    limit
  });
}

function updateAmbientRecentNodes() {
  const items = recentOrbitVisibleItems(ambientRecentNodeLimit);
  state.ambientRecentNodeIds = new Set(selectAmbientRecentNodeIds({
    recentItems: items,
    visibleNodeIds: state.visibleNodeIds,
    limit: ambientRecentNodeLimit
  }));
  state.performanceStats.ambientRecentCount = state.ambientRecentNodeIds.size;
}

function emitLivingPulse({
  nodeIds = [],
  edgeIds = [],
  originNodeId = null,
  intensity = 0.65,
  durationMs = 1100
} = {}) {
  if (prefersReducedMotion) {
    return;
  }
  const pulseNodeIds = Array.from(nodeIds || []).filter((nodeId) => state.visibleNodeIds.has(String(nodeId)));
  const pulseEdgeIds = Array.from(edgeIds || []).filter((edgeId) => state.edgeById.has(String(edgeId)));
  if (!pulseNodeIds.length && !pulseEdgeIds.length) {
    return;
  }
  const now = performance.now();
  const pulse = createLivingPulse({
    nodeIds: pulseNodeIds,
    edgeIds: pulseEdgeIds,
    originNodeId,
    now,
    durationMs,
    intensity,
    maxNodes: livingPulseNodeLimit,
    maxEdges: livingPulseEdgeLimit
  });
  state.livingPulseEvents = pruneLivingPulses(state.livingPulseEvents, now).slice(-3);
  state.livingPulseEvents.push(pulse);
  state.lastLivingInteractionAt = now;
  state.performanceStats.livingPulseCount = state.livingPulseEvents.length;
  requestRender();
}

function clearLivingPulses(render = true) {
  state.livingPulseEvents = [];
  state.performanceStats.livingPulseCount = 0;
  if (render) {
    requestRender();
  }
}

function pulseNodeNeighborhood(nodeId, nodeLimit = livingPulseNodeLimit, edgeLimit = livingPulseEdgeLimit) {
  const node = nodeForId(nodeId);
  if (!node) {
    return { nodeIds: [], edgeIds: [] };
  }
  const topNeighbors = topNeighborsForNode(node.id, Math.max(0, nodeLimit - 1));
  const nodeIds = [node.id, ...topNeighbors.map((neighbor) => neighbor.id)];
  const nodeSet = new Set(nodeIds);
  const edgeIds = (state.edgesByNode.get(node.id) || [])
    .filter((edge) => nodeSet.has(edge.source) && nodeSet.has(edge.target))
    .slice(0, edgeLimit)
    .map((edge) => edge.id);
  return { nodeIds, edgeIds };
}

function pulseEdgesForNodeIds(nodeIds, limit = livingPulseEdgeLimit) {
  const nodeSet = new Set(Array.from(nodeIds || []).map(String));
  const edgeIds = [];
  for (const edge of state.visibleEdges) {
    if (nodeSet.has(edge.source) && nodeSet.has(edge.target)) {
      edgeIds.push(edge.id);
      if (edgeIds.length >= limit) {
        break;
      }
    }
  }
  return edgeIds;
}

function graphStoryVisibleSteps() {
  return buildGraphStorySteps({
    nodes: state.visibleNodes,
    edges: state.visibleEdges,
    communities: state.communities.filter((community) => state.communityEnabled.has(community.name)),
    degreeByNode: state.degreeByNode,
    metadata: window.__brainBarNodeFileMetadata || {},
    limits: {
      recent: graphStoryRecentLimit,
      keyNotes: graphStoryKeyNoteLimit,
      communities: graphStoryCommunityLimit,
      bridgeNotes: graphStoryBridgeLimit,
      edges: graphStoryEdgeLimit
    }
  });
}

function startGraphStory() {
  const steps = graphStoryVisibleSteps();
  if (!steps.length) {
    showOverlay('No Graph Story steps in current view');
    return;
  }
  clearInteractiveModes();
  state.graphStoryMode = true;
  state.graphStorySteps = steps;
  state.graphStoryStepIndex = 0;
  applyGraphStoryStep(0, true);
}

function applyGraphStoryStep(index, render = true) {
  if (!state.graphStorySteps.length) {
    clearGraphStory(render);
    return;
  }
  const nextIndex = clamp(Math.round(Number(index) || 0), 0, state.graphStorySteps.length - 1);
  const step = state.graphStorySteps[nextIndex];
  state.graphStoryMode = true;
  state.graphStoryStepIndex = nextIndex;
  state.graphStoryNodeIds = new Set(step.nodeIds || []);
  state.graphStoryFocusNodeIds = new Set(step.focusNodeIds || step.nodeIds || []);
  state.graphStoryEdgeIds = new Set(step.edgeIds || []);
  state.graphStoryActiveNodeId = step.activeNodeId || Array.from(state.graphStoryFocusNodeIds)[0] || null;
  state.graphStoryActiveCommunityName = step.activeCommunityName || null;
  state.graphStoryMessage = step.summary || '';
  state.selectedNode = null;
  selectedMarker.visible = false;

  if (step.type === 'community' && step.activeCommunityName) {
    const spotlight = computeCommunitySpotlight(step.activeCommunityName);
    state.graphStoryNodeIds = spotlight.nodeIds;
    state.graphStoryFocusNodeIds = spotlight.focusNodeIds;
    state.graphStoryEdgeIds = spotlight.overlayEdgeIds;
    state.graphStoryActiveNodeId = step.activeNodeId || spotlight.topNodes[0]?.id || null;
  }

  if (state.graphStoryActiveNodeId) {
    const activeNode = nodeForId(state.graphStoryActiveNodeId);
    if (activeNode && !state.selectedNode) {
      positionSelectedMarker(activeNode);
    }
  }

  focusGraphStoryStep(step);
  emitLivingPulse({
    nodeIds: Array.from(state.graphStoryFocusNodeIds),
    edgeIds: Array.from(state.graphStoryEdgeIds),
    originNodeId: state.graphStoryActiveNodeId,
    intensity: 0.48,
    durationMs: 1180
  });
  if (render) {
    renderNodeInfo(state.selectedNode);
    updateHud();
    requestRender();
  }
}

function currentGraphStoryStep() {
  return state.graphStorySteps[state.graphStoryStepIndex] || null;
}

function activateGraphStoryNode(nodeId) {
  const step = currentGraphStoryStep();
  const node = nodeForId(nodeId);
  if (!step || !node) {
    return;
  }
  state.graphStoryActiveNodeId = node.id;
  state.selectedNode = null;
  positionSelectedMarker(node);
  focusGraphStoryStep(step);
  emitLivingPulse({
    ...pulseNodeNeighborhood(node.id, 8, 24),
    originNodeId: node.id,
    intensity: 0.42,
    durationMs: 900
  });
  renderNodeInfo(null);
  updateHud();
  requestRender();
}

function clearGraphStory(render = true) {
  state.graphStoryMode = false;
  state.graphStorySteps = [];
  state.graphStoryStepIndex = 0;
  state.graphStoryNodeIds = new Set();
  state.graphStoryEdgeIds = new Set();
  state.graphStoryFocusNodeIds = new Set();
  state.graphStoryActiveNodeId = null;
  state.graphStoryActiveCommunityName = null;
  state.graphStoryMessage = '';
  if (render) {
    selectedMarker.visible = !!state.selectedNode;
    if (state.selectedNode) {
      positionSelectedMarker(state.selectedNode);
    } else {
      fitCameraToGraph('Back to all');
    }
    renderNodeInfo(state.selectedNode);
    updateHud();
    requestRender();
  }
}

function focusGraphStoryStep(step) {
  const focusIds = state.graphStoryFocusNodeIds.size
    ? state.graphStoryFocusNodeIds
    : state.graphStoryNodeIds;
  fitCameraToNodeIds(focusIds, 'Graph Story', {
    minimumSpan: step?.type === 'community' ? 320 : 240,
    widthPadding: 1.24,
    heightPadding: 1.02,
    maxZoom: 2.9
  });
}

function applyRecentOrbit(preferredNodeId = null, selectActiveNode = false) {
  const items = recentOrbitVisibleItems(recentOrbitNodeLimit);
  if (!items.length) {
    showOverlay('No recent metadata in current view');
    return;
  }

  clearInteractiveModes();

  const preferred = preferredNodeId
    ? items.find((item) => item.id === String(preferredNodeId))
    : null;
  const match = preferred
    ? {
      item: preferred,
      path: nearestKeyNotePath({
        sourceId: preferred.id,
        nodes: state.visibleNodes,
        edges: state.visibleEdges,
        degreeByNode: state.degreeByNode,
        keyNoteLimit: recentOrbitKeyNoteLimit
      })
    }
    : firstRecentWithKeyPath(items) || {
      item: items[0],
      path: nearestKeyNotePath({
        sourceId: items[0].id,
        nodes: state.visibleNodes,
        edges: state.visibleEdges,
        degreeByNode: state.degreeByNode,
        keyNoteLimit: recentOrbitKeyNoteLimit
      })
    };

  if (!match.item) {
    showOverlay('No recent metadata in current view');
    return;
  }

  state.recentOrbitMode = true;
  state.recentOrbitItems = items;
  state.recentOrbitNodeIds = new Set(items.map((item) => item.id));
  state.recentOrbitActiveNodeId = match.item.id;
  applyRecentOrbitPathState(match.path);
  state.recentOrbitMessage = match.path.found ? '' : match.path.message;

  const activeNode = nodeForId(match.item.id);
  if (selectActiveNode && activeNode) {
    state.selectedNode = activeNode;
    positionSelectedMarker(activeNode);
  } else {
    state.selectedNode = null;
    selectedMarker.visible = false;
  }
  renderNodeInfo(state.selectedNode);
  focusRecentOrbit(match.path, activeNode);
  emitLivingPulse({
    nodeIds: state.recentOrbitOrderedNodeIds.length
      ? state.recentOrbitOrderedNodeIds
      : [match.item.id],
    edgeIds: state.recentOrbitOrderedEdgeIds,
    originNodeId: match.item.id,
    intensity: 0.54,
    durationMs: 1180
  });
  updateHud();
  requestRender();
}

function firstRecentWithKeyPath(items) {
  for (const item of items) {
    const path = nearestKeyNotePath({
      sourceId: item.id,
      nodes: state.visibleNodes,
      edges: state.visibleEdges,
      degreeByNode: state.degreeByNode,
      keyNoteLimit: recentOrbitKeyNoteLimit
    });
    if (path.found) {
      return { item, path };
    }
  }
  return null;
}

function applyRecentOrbitPathState(path) {
  state.recentOrbitTargetNodeId = path?.targetId || null;
  state.recentOrbitPathNodeIds = path?.nodeIds || new Set();
  state.recentOrbitPathEdgeIds = path?.edgeIds || new Set();
  state.recentOrbitOrderedNodeIds = path?.orderedNodeIds || [];
  state.recentOrbitOrderedEdgeIds = path?.orderedEdgeIds || [];
}

function focusRecentOrbit() {
  fitCameraWithTilt('Recent Orbit', 0.72, 0.88);
}

function clearRecentOrbit(render = true) {
  state.recentOrbitMode = false;
  state.recentOrbitNodeIds = new Set();
  state.recentOrbitActiveNodeId = null;
  state.recentOrbitTargetNodeId = null;
  state.recentOrbitPathNodeIds = new Set();
  state.recentOrbitPathEdgeIds = new Set();
  state.recentOrbitOrderedNodeIds = [];
  state.recentOrbitOrderedEdgeIds = [];
  state.recentOrbitItems = [];
  state.recentOrbitMessage = '';
  if (render) {
    fitCameraToGraph('Back to all');
    renderNodeInfo(state.selectedNode);
    updateHud();
    requestRender();
  }
}

function focusCommunitySpotlight(spotlight) {
  fitCameraToNodeIds(spotlight.focusNodeIds?.size ? spotlight.focusNodeIds : spotlight.nodeIds, 'Community Spotlight', {
    minimumSpan: 180,
    widthPadding: 1.18,
    heightPadding: 0.92,
    minZoom: 0.18,
    maxZoom: 4.2
  });
}

function applyFocusOrbit(node, depth = 1, focusCamera = true) {
  if (!node) {
    return;
  }
  clearInteractiveModes();
  const focus = computeFocusOrbit(node.id, depth);
  state.focusMode = true;
  state.focusDepth = focus.depth;
  state.focusNodeId = node.id;
  state.focusNodeIds = focus.nodeIds;
  state.focusEdgeIds = focus.edgeIds;
  state.focusNodeDistance = focus.nodeDistance;
  state.selectedNode = node;
  renderNodeInfo(node);
  positionSelectedMarker(node);
  if (focusCamera) {
    focusNode(node, 'Focus orbit');
  }
  emitLivingPulse({
    nodeIds: Array.from(focus.nodeIds),
    edgeIds: Array.from(focus.edgeIds),
    originNodeId: node.id,
    intensity: 0.60,
    durationMs: 1050
  });
  updateHud();
  requestRender();
}

function armPathSource(node) {
  if (!node) {
    return;
  }
  clearInteractiveModes();
  state.pathMode = true;
  state.pathSourceId = node.id;
  state.pathTargetId = null;
  state.pathNodeIds = new Set();
  state.pathEdgeIds = new Set();
  state.pathOrderedNodeIds = [];
  state.pathOrderedEdgeIds = [];
  state.pathVariants = [];
  state.activePathVariantId = 'shortest';
  state.pathMessage = 'Path source set · click another node';
  state.selectedNode = node;
  renderNodeInfo(node);
  positionSelectedMarker(node);
  focusNode(node, 'Path source');
  emitLivingPulse({
    ...pulseNodeNeighborhood(node.id, 8, 24),
    originNodeId: node.id,
    intensity: 0.50,
    durationMs: 900
  });
  updateHud();
  requestRender();
}

function applyPathToNode(targetNode) {
  const sourceNode = nodeForId(state.pathSourceId);
  if (!sourceNode || !targetNode || sourceNode.id === targetNode.id) {
    return;
  }
  clearInteractiveModes({ preservePathSource: true });
  const variants = computePathVariants({
    sourceId: sourceNode.id,
    targetId: targetNode.id,
    nodes: state.visibleNodes,
    edges: state.visibleEdges
  });
  const path = variants.find((variant) => variant.id === 'shortest') || variants[0];
  state.pathMode = true;
  state.pathSourceId = sourceNode.id;
  state.pathTargetId = targetNode.id;
  state.pathVariants = variants;
  state.activePathVariantId = path?.id || 'shortest';
  applyPathVariantState(path);
  state.selectedNode = targetNode;
  renderNodeInfo(targetNode);
  positionSelectedMarker(targetNode);
  if (path?.found) {
    focusPath(path, 'Shortest path');
  } else {
    focusNode(targetNode, 'Path target');
  }
  emitLivingPulse({
    nodeIds: path?.found ? path.orderedNodeIds : [sourceNode.id, targetNode.id],
    edgeIds: path?.found ? path.orderedEdgeIds : pulseEdgesForNodeIds([sourceNode.id, targetNode.id], 12),
    originNodeId: sourceNode.id,
    intensity: path?.found ? 0.76 : 0.44,
    durationMs: path?.found ? 1350 : 850
  });
  updateHud();
  requestRender();
}

function activePathVariant() {
  return state.pathVariants.find((variant) => variant.id === state.activePathVariantId) || state.pathVariants[0] || null;
}

function applyPathVariant(variantId) {
  const variant = state.pathVariants.find((item) => item.id === variantId);
  if (!variant || !variant.found || variant.sameAs) {
    return;
  }
  state.activePathVariantId = variant.id;
  applyPathVariantState(variant);
  renderNodeInfo(state.selectedNode);
  if (variant.found) {
    focusPath(variant, variant.label);
  }
  emitLivingPulse({
    nodeIds: variant.orderedNodeIds,
    edgeIds: variant.orderedEdgeIds,
    originNodeId: variant.orderedNodeIds[0],
    intensity: 0.64,
    durationMs: 1050
  });
  updateHud();
  requestRender();
}

function applyPathVariantState(path) {
  state.pathNodeIds = path?.nodeIds || new Set();
  state.pathEdgeIds = path?.edgeIds || new Set();
  state.pathOrderedNodeIds = path?.orderedNodeIds || [];
  state.pathOrderedEdgeIds = path?.orderedEdgeIds || [];
  state.pathMessage = path?.message || '';
}

function clearPathMode(render = true) {
  state.pathMode = false;
  state.pathSourceId = null;
  state.pathTargetId = null;
  state.pathNodeIds = new Set();
  state.pathEdgeIds = new Set();
  state.pathOrderedNodeIds = [];
  state.pathOrderedEdgeIds = [];
  state.pathVariants = [];
  state.activePathVariantId = 'shortest';
  state.pathMessage = '';
  state.pathPulsePhase = 0;
  if (render) {
    renderNodeInfo(state.selectedNode);
    updateHud();
    requestRender();
  }
}

function backToAll() {
  clearInteractiveModes();
  clearLivingPulses(false);
  fitCameraToGraph('All');
  renderNodeInfo(state.selectedNode);
  updateHud();
  requestRender();
}

function setFocusDepth(depth) {
  const focusNode = nodeForId(state.focusNodeId) || state.selectedNode;
  if (!focusNode) {
    return;
  }
  applyFocusOrbit(focusNode, depth, false);
}

function clearFocusOrbit(resetView = true) {
  state.focusMode = false;
  state.focusDepth = 1;
  state.focusNodeId = null;
  state.focusNodeIds = new Set();
  state.focusEdgeIds = new Set();
  state.focusNodeDistance = new Map();
  if (resetView) {
    markVisualCacheDirty();
    fitCameraToGraph('Back to all');
    renderNodeInfo(state.selectedNode);
    updateHud();
    requestRender();
  }
}

function computeFocusOrbit(centerNodeId, depth = 1) {
  const normalizedDepth = clamp(Math.round(Number(depth) || 1), 1, 3);
  const centerId = String(centerNodeId);
  const nodeIds = new Set([centerId]);
  const nodeDistance = new Map([[centerId, 0]]);
  let frontier = new Set([centerId]);

  for (let level = 1; level <= normalizedDepth; level += 1) {
    const next = new Set();
    frontier.forEach((nodeId) => {
      (state.adjacencyByNode.get(nodeId) || new Set()).forEach((neighborId) => {
        if (nodeIds.has(neighborId)) {
          return;
        }
        nodeIds.add(neighborId);
        nodeDistance.set(neighborId, level);
        next.add(neighborId);
      });
    });
    frontier = next;
    if (!frontier.size) {
      break;
    }
  }

  const edgeIds = new Set();
  nodeIds.forEach((nodeId) => {
    (state.edgesByNode.get(nodeId) || []).forEach((edge) => {
      if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
        edgeIds.add(edge.id);
      }
    });
  });

  return {
    depth: normalizedDepth,
    nodeIds,
    edgeIds,
    nodeDistance
  };
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

function focusNode(node, preset = 'Node focus') {
  const position = state.positions.get(node.id);
  if (!position) {
    return;
  }
  orbitCameraTo(position, clamp(Math.max(camera.zoom, 1.7), 0.08, 8), preset);
}

function focusSearchReveal(node) {
  const nodeIds = new Set([node.id, ...state.searchRevealNeighborIds]);
  fitCameraToNodeIds(nodeIds, 'Search reveal', {
    minimumSpan: 180,
    maxZoom: 4.8
  });
}

function focusPath(path, preset = 'Shortest path') {
  const positions = path.orderedNodeIds
    .map((nodeId) => state.positions.get(nodeId))
    .filter(Boolean);
  fitCameraToPositions(positions, preset, {
    minimumSpan: 160,
    widthPadding: 1.25,
    heightPadding: 0.95,
    minZoom: 0.28,
    maxZoom: 3.8
  });
}

function orbitCameraTo(position, zoom, preset) {
  const target = new THREE.Vector3(position.x, position.y, position.z);
  if (prefersReducedMotion) {
    controls.target.copy(target);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    controls.update();
    state.cameraPreset = preset;
    markVisualCacheDirty();
    updateHud();
    requestRender();
    return;
  }

  const startTarget = controls.target.clone();
  const startPosition = camera.position.clone();
  const startZoom = camera.zoom;
  const offset = startPosition.clone().sub(startTarget);
  const startedAt = performance.now();
  const duration = 320;

  function tick(now) {
    const t = smoothstep(clamp((now - startedAt) / duration, 0, 1));
    controls.target.lerpVectors(startTarget, target, t);
    camera.position.copy(controls.target).add(offset);
    camera.zoom = startZoom + (zoom - startZoom) * t;
    camera.updateProjectionMatrix();
    controls.update();
    markVisualCacheDirty();
    requestRender();
    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      state.cameraPreset = preset;
      updateHud();
    }
  }

  requestAnimationFrame(tick);
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

function edgeAtEvent(event) {
  if (!state.projectedPoints.size) {
    return null;
  }
  const rect = renderer.domElement.getBoundingClientRect();
  const point = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
  const threshold = 8;
  let bestEdge = null;
  let bestDistance = threshold;
  const candidateEdges = candidateEdgesNearPoint(point, threshold);

  candidateEdges.forEach((edge) => {
    const source = state.projectedPoints.get(edge.source);
    const target = state.projectedPoints.get(edge.target);
    if (!source || !target) {
      return;
    }
    const padding = threshold + 34;
    if (
      point.x < Math.min(source.x, target.x) - padding ||
      point.x > Math.max(source.x, target.x) + padding ||
      point.y < Math.min(source.y, target.y) - padding ||
      point.y > Math.max(source.y, target.y) + padding
    ) {
      return;
    }

    const distance = distanceToCurvedEdge(point, edge, source, target);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestEdge = edge;
    }
  });

  return bestEdge;
}

function candidateEdgesNearPoint(point, threshold) {
  if (state.focusMode && state.focusEdgeIds.size) {
    const edges = focusOverlayEdges();
    state.performanceStats.lastHitTestCandidateCount = edges.length;
    return edges;
  }
  if (state.graphStoryMode && state.graphStoryEdgeIds.size) {
    const edges = graphStoryOverlayEdges();
    state.performanceStats.lastHitTestCandidateCount = edges.length;
    return edges;
  }

  const candidateIds = new Set();
  const nodeRadius = clamp(54 / Math.max(camera.zoom, 0.45), 18, 72);
  const nearbyNodeIds = state.projectedPointGrid
    ? nearbyProjectedNodeIds(state.projectedPointGrid, point, nodeRadius)
    : Array.from(state.projectedPoints.keys());
  nearbyNodeIds.forEach((nodeId) => {
    const projected = state.projectedPoints.get(nodeId);
    if (!projected) {
      return;
    }
    if (
      Math.abs(projected.x - point.x) > nodeRadius ||
      Math.abs(projected.y - point.y) > nodeRadius
    ) {
      return;
    }
    (state.edgesByNode.get(nodeId) || []).forEach((edge) => candidateIds.add(edge.id));
  });

  if (!candidateIds.size && state.selectedNode) {
    (state.edgesByNode.get(state.selectedNode.id) || []).forEach((edge) => candidateIds.add(edge.id));
  }

  const maxCandidates = state.selectedNode ? 260 : 160;
  const candidates = [];
  for (const edgeId of candidateIds) {
    const edge = state.edgeById.get(edgeId);
    if (edge) {
      candidates.push(edge);
    }
    if (candidates.length >= maxCandidates) {
      break;
    }
  }
  state.performanceStats.lastHitTestCandidateCount = candidates.length;
  return candidates;
}

function distanceToCurvedEdge(point, edge, source, target) {
  const control = curvedEdgeControl(edge, source, target, 0.74);
  let minDistance = Infinity;
  let previous = source;
  for (let step = 1; step <= 10; step += 1) {
    const current = pointOnQuadratic(source, control, target, step / 10);
    minDistance = Math.min(minDistance, distanceToSegment(point, previous, current));
    previous = current;
  }
  return minDistance;
}

function pointOnQuadratic(source, control, target, t) {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * source.x + 2 * inverse * t * control.x + t * t * target.x,
    y: inverse * inverse * source.y + 2 * inverse * t * control.y + t * t * target.y
  };
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  const x = start.x + dx * t;
  const y = start.y + dy * t;
  return Math.hypot(point.x - x, point.y - y);
}

function compactNodeLabel(label) {
  const normalized = String(label || 'Untitled').replace(/\s+/g, ' ').trim();
  return normalized.length > 42 ? `${normalized.slice(0, 39)}...` : normalized;
}

function formatRecentTimestamp(timestamp) {
  if (!timestamp) {
    return 'recent';
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return 'recent';
  }
  return date.toISOString().slice(0, 10);
}

function rectanglesOverlap(left, right) {
  const padding = 5;
  return !(
    left.x + left.width + padding < right.x ||
    right.x + right.width + padding < left.x ||
    left.y + left.height + padding < right.y ||
    right.y + right.height + padding < left.y
  );
}

function roundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
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
  return state.degreeByNode.get(nodeId) ?? 0;
}

function colorForCommunity(name) {
  const community = state.communityByName.get(name);
  return community?.color ?? palette[0];
}

function accentColorForCommunity(name) {
  const community = state.communityByName.get(name);
  return community?.accentColor ?? accentPalette[0];
}

function colorForEdge(edge) {
  const source = nodeForId(edge.source);
  const target = nodeForId(edge.target);
  return accentColorForCommunity(source?.community ?? target?.community ?? '');
}

function nodeForId(nodeId) {
  const index = state.nodeIndexById.get(nodeId);
  return Number.isInteger(index) ? state.visibleNodes[index] : null;
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
    schedulePointerHitTest(event);
  });

  renderer?.domElement?.addEventListener('pointerleave', () => {
    if (state.pointerHitFrame) {
      cancelAnimationFrame(state.pointerHitFrame);
      state.pointerHitFrame = null;
      state.pendingPointerEvent = null;
    }
    if (!state.hoveredNode && !state.hoveredEdge) {
      return;
    }
    state.hoveredNode = null;
    state.hoveredEdge = null;
    stage.style.cursor = 'grab';
    requestRender();
  });

  renderer?.domElement?.addEventListener('click', (event) => {
    const node = nodeAtEvent(event);
    if (node) {
      if (state.pathMode && state.pathSourceId && !state.pathTargetId && node.id !== state.pathSourceId) {
        applyPathToNode(node);
      } else if (state.focusMode) {
        applyFocusOrbit(node, state.focusDepth);
      } else {
        selectNode(node);
      }
    } else if (state.selectedNode || state.focusMode || state.pathMode || state.searchRevealNodeId) {
      clearFocusOrbit(false);
      clearPathMode(false);
      clearSearchReveal(false);
      state.selectedNode = null;
      selectedMarker.visible = false;
      renderNodeInfo(null);
      updateHud();
      requestRender();
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

function schedulePointerHitTest(event) {
  state.pendingPointerEvent = {
    clientX: event.clientX,
    clientY: event.clientY
  };
  if (state.pointerHitFrame) {
    return;
  }
  state.pointerHitFrame = requestAnimationFrame(() => {
    const pendingEvent = state.pendingPointerEvent;
    state.pendingPointerEvent = null;
    state.pointerHitFrame = null;
    if (pendingEvent) {
      updatePointerHover(pendingEvent);
    }
  });
}

function updatePointerHover(event) {
  const node = nodeAtEvent(event);
  const edge = node ? null : edgeAtEvent(event);
  if (node === state.hoveredNode && edge === state.hoveredEdge) {
    return;
  }

  if (node && state.hoveredNode) {
    state.hoverIntensity = Math.min(state.hoverIntensity, 0.35);
  }
  state.hoveredNode = node;
  state.hoveredEdge = edge;
  if (node && !state.selectedNode) {
    state.hoverVisualNode = node;
  }
  stage.style.cursor = node ? 'pointer' : (edge ? 'crosshair' : 'grab');
  requestRender();
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
      clearInteractiveModes();
      prepareCommunities(state.graph);
      applyLens(true);
    } catch (error) {
      reportDiagnostic(error.message || '3D graph data could not be loaded', true);
    }
  };

  window.brainBarApplyGraphLens = (lens) => {
    state.lens = lens;
    state.selectedNode = null;
    clearInteractiveModes();
    applyLens(true);
  };

  window.brainBarResetCamera = resetCamera;
  window.brainBarZoom = zoomCamera;
  window.brainBarTopView = topView;
  window.brainBarResetTilt = resetTilt;
  window.brainBarRendererDiagnostics = () => ({
    activeMode: activeMode(),
    nodes: state.visibleNodes.length,
    edges: state.visibleEdges.length,
    highlightedEdges: state.performanceStats.highlightedEdgeCount,
    lens: state.lens,
    communities: state.communities.length,
    cameraPreset: state.cameraPreset,
    cameraZoom: camera?.zoom ?? 0,
    drawCalls: renderer?.info?.render?.calls ?? 0,
    triangles: renderer?.info?.render?.triangles ?? 0,
    points: renderer?.info?.render?.points ?? 0,
    lines: renderer?.info?.render?.lines ?? 0,
    visibleProjectedNodeCount: state.visibleProjectedNodeCount,
    staticRebuildMs: Number(state.performanceStats.staticRebuildMs.toFixed(2)),
    overlayFrameMs: Number(state.performanceStats.overlayFrameMs.toFixed(2)),
    livingPulseCount: state.performanceStats.livingPulseCount,
    ambientRecentCount: state.performanceStats.ambientRecentCount,
    hitTestCandidateCount: state.performanceStats.lastHitTestCandidateCount,
    stageWidth: stage.clientWidth,
    stageHeight: stage.clientHeight,
    diagnostic: state.lastDiagnostic
  });
}
