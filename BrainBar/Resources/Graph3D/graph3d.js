import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';

const canvas = document.getElementById('graph-canvas');
const overlay = document.getElementById('overlay');
const search = document.getElementById('search');
const searchResults = document.getElementById('search-results');
const nodeInfo = document.getElementById('node-info');
const legend = document.getElementById('legend');
const stats = document.getElementById('stats');

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
  selectedNode: null,
  hoveredIndex: null,
  animationFrame: null
};

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x060912, 0.0015);

const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 5000);
camera.position.set(0, 0, 760);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x060912, 1);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.65;
controls.zoomSpeed = 0.72;
controls.panSpeed = 0.55;
controls.minDistance = 120;
controls.maxDistance = 2000;

const raycaster = new THREE.Raycaster();
raycaster.params.Points.threshold = 9;
const pointer = new THREE.Vector2();

let nodesMesh = null;
let edgesMesh = null;
let selectedMesh = null;

function normalizeGraph(payload) {
  if (!payload) {
    return { nodes: [], edges: [] };
  }

  const rawNodes = Array.isArray(payload.nodes) ? payload.nodes : [];
  const rawEdges = Array.isArray(payload.links) ? payload.links : (Array.isArray(payload.edges) ? payload.edges : []);
  const nodes = rawNodes.map((node, index) => {
    const id = String(node.id ?? node.label ?? node.name ?? index);
    return {
      ...node,
      id,
      label: String(node.label ?? node.name ?? id),
      community: String(node.community ?? node.group ?? node.cluster ?? 'Community 0'),
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

function applyLens() {
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

  const enabledCommunities = state.communityEnabled;
  state.visibleNodes = lensNodes.filter((node) => enabledCommunities.has(node.community));
  const visibleIds = new Set(state.visibleNodes.map((node) => node.id));
  state.visibleEdges = lensEdges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));

  renderGraph();
  renderSidebar();
  updateOverlay();
}

function isObsidianEdge(edge) {
  return edge.context === 'obsidian_wikilink' || edge.relation === 'obsidian_wikilink';
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

function renderGraph() {
  disposeObject(nodesMesh);
  disposeObject(edgesMesh);
  disposeObject(selectedMesh);
  nodesMesh = null;
  edgesMesh = null;
  selectedMesh = null;

  calculateLayout();

  const nodePositions = new Float32Array(state.visibleNodes.length * 3);
  const nodeColors = new Float32Array(state.visibleNodes.length * 3);
  state.visibleNodes.forEach((node, index) => {
    const position = state.positions.get(node.id) ?? new THREE.Vector3();
    nodePositions[index * 3] = position.x;
    nodePositions[index * 3 + 1] = position.y;
    nodePositions[index * 3 + 2] = position.z;
    const color = new THREE.Color(colorForCommunity(node.community));
    nodeColors[index * 3] = color.r;
    nodeColors[index * 3 + 1] = color.g;
    nodeColors[index * 3 + 2] = color.b;
  });

  const nodeGeometry = new THREE.BufferGeometry();
  nodeGeometry.setAttribute('position', new THREE.BufferAttribute(nodePositions, 3));
  nodeGeometry.setAttribute('color', new THREE.BufferAttribute(nodeColors, 3));
  const nodeMaterial = new THREE.PointsMaterial({
    size: 5.6,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.96,
    depthWrite: false
  });
  nodesMesh = new THREE.Points(nodeGeometry, nodeMaterial);
  scene.add(nodesMesh);

  const edgePositions = new Float32Array(state.visibleEdges.length * 6);
  state.visibleEdges.forEach((edge, index) => {
    const source = state.positions.get(edge.source) ?? new THREE.Vector3();
    const target = state.positions.get(edge.target) ?? new THREE.Vector3();
    edgePositions[index * 6] = source.x;
    edgePositions[index * 6 + 1] = source.y;
    edgePositions[index * 6 + 2] = source.z;
    edgePositions[index * 6 + 3] = target.x;
    edgePositions[index * 6 + 4] = target.y;
    edgePositions[index * 6 + 5] = target.z;
  });
  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3));
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0x8c9ec8,
    transparent: true,
    opacity: 0.18,
    depthWrite: false
  });
  edgesMesh = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  scene.add(edgesMesh);

  updateSelectedMarker();
}

function calculateLayout() {
  state.positions = new Map();
  const communityMap = new Map(state.communities.map((community, index) => [community.name, index]));
  const communityCount = Math.max(state.communities.length, 1);
  const clusterRadius = Math.min(360, 120 + communityCount * 8);
  const nodesByCommunity = new Map();

  state.visibleNodes.forEach((node) => {
    const nodes = nodesByCommunity.get(node.community) ?? [];
    nodes.push(node);
    nodesByCommunity.set(node.community, nodes);
  });

  nodesByCommunity.forEach((nodes, communityName) => {
    const communityIndex = communityMap.get(communityName) ?? 0;
    const center = pointOnSphere(communityIndex, communityCount).multiplyScalar(clusterRadius);
    const localRadius = Math.max(20, Math.min(150, Math.sqrt(nodes.length) * 12));
    nodes.forEach((node, index) => {
      const seed = hashString(node.id);
      const angle = index * 2.399963 + (seed % 100) * 0.01;
      const distance = localRadius * Math.sqrt((index + 0.5) / Math.max(nodes.length, 1));
      const z = (((seed >> 8) % 200) / 100 - 1) * localRadius * 0.62;
      state.positions.set(node.id, new THREE.Vector3(
        center.x + Math.cos(angle) * distance,
        center.y + Math.sin(angle) * distance,
        center.z + z
      ));
    });
  });

  relaxLayout(nodesByCommunity, communityMap, clusterRadius);
}

function relaxLayout(nodesByCommunity, communityMap, clusterRadius) {
  const visibleIds = new Set(state.visibleNodes.map((node) => node.id));
  const edgeIterations = Math.min(90, Math.max(24, state.visibleEdges.length / 12));
  const targetDistance = 42;

  for (let iteration = 0; iteration < edgeIterations; iteration += 1) {
    state.visibleEdges.forEach((edge) => {
      if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) {
        return;
      }
      const source = state.positions.get(edge.source);
      const target = state.positions.get(edge.target);
      const delta = new THREE.Vector3().subVectors(target, source);
      const length = Math.max(delta.length(), 0.001);
      const force = (length - targetDistance) * 0.012;
      delta.multiplyScalar(force / length);
      source.add(delta);
      target.sub(delta);
    });

    nodesByCommunity.forEach((nodes, communityName) => {
      const communityIndex = communityMap.get(communityName) ?? 0;
      const center = pointOnSphere(communityIndex, Math.max(state.communities.length, 1)).multiplyScalar(clusterRadius);
      nodes.forEach((node) => {
        const position = state.positions.get(node.id);
        position.lerp(center, 0.008);
      });
    });
  }
}

function pointOnSphere(index, count) {
  const offset = 2 / count;
  const increment = Math.PI * (3 - Math.sqrt(5));
  const y = ((index * offset) - 1) + (offset / 2);
  const radius = Math.sqrt(1 - y * y);
  const phi = index * increment;
  return new THREE.Vector3(Math.cos(phi) * radius, y, Math.sin(phi) * radius);
}

function colorForCommunity(name) {
  const community = state.communities.find((item) => item.name === name);
  return community?.color ?? palette[0];
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
    <p><strong>Type:</strong> ${escapeHTML(node.type ?? 'document')}</p>
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
      applyLens();
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

function degreeForNode(nodeId) {
  return state.visibleEdges.filter((edge) => edge.source === nodeId || edge.target === nodeId).length;
}

function selectNode(node, focusCamera = false) {
  state.selectedNode = node;
  renderNodeInfo(node);
  updateSelectedMarker();
  if (focusCamera) {
    focusNode(node);
  }
}

function updateSelectedMarker() {
  disposeObject(selectedMesh);
  selectedMesh = null;
  if (!state.selectedNode || !state.positions.has(state.selectedNode.id)) {
    return;
  }
  const color = new THREE.Color(colorForCommunity(state.selectedNode.community));
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(10, 24, 16),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.96 })
  );
  marker.position.copy(state.positions.get(state.selectedNode.id));
  selectedMesh = marker;
  scene.add(selectedMesh);
}

function focusNode(node) {
  const position = state.positions.get(node.id);
  if (!position) {
    return;
  }
  controls.target.copy(position);
  camera.position.lerp(new THREE.Vector3(position.x, position.y, position.z + 320), 0.86);
  controls.update();
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

function resetCamera() {
  controls.target.set(0, 0, 0);
  camera.position.set(0, 0, 760);
  controls.update();
}

function resize() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height, 1);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function pointerForEvent(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function nodeAtEvent(event) {
  if (!nodesMesh) {
    return null;
  }
  pointerForEvent(event);
  raycaster.setFromCamera(pointer, camera);
  const intersections = raycaster.intersectObject(nodesMesh);
  if (!intersections.length) {
    return null;
  }
  return state.visibleNodes[intersections[0].index] ?? null;
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

function disposeObject(object) {
  if (!object) {
    return;
  }
  scene.remove(object);
  object.geometry?.dispose();
  object.material?.dispose();
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

function animate() {
  controls.update();
  renderer.render(scene, camera);
  state.animationFrame = requestAnimationFrame(animate);
}

window.brainBarLoadGraph = (payload, lens = 'all') => {
  state.graph = normalizeGraph(payload);
  state.lens = lens;
  state.selectedNode = null;
  prepareCommunities(state.graph);
  resetCamera();
  applyLens();
};

window.brainBarApplyGraphLens = (lens) => {
  state.lens = lens;
  state.selectedNode = null;
  applyLens();
};

window.brainBarResetCamera = resetCamera;

canvas.addEventListener('click', (event) => {
  const node = nodeAtEvent(event);
  if (node) {
    selectNode(node);
  }
});

canvas.addEventListener('dblclick', (event) => {
  const node = nodeAtEvent(event);
  if (node) {
    sendNodeAction('openNode', node);
  }
});

search.addEventListener('input', renderSearchResults);
window.addEventListener('resize', resize);

resize();
animate();

if (window.__brainBarGraphJSON) {
  window.brainBarLoadGraph(window.__brainBarGraphJSON, window.__brainBarPendingGraphLens || 'all');
} else {
  fetch('./graph.json')
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Graph data unavailable (${response.status})`);
      }
      return response.json();
    })
    .then((payload) => {
      window.__brainBarGraphJSON = payload;
      window.brainBarLoadGraph(payload, window.__brainBarPendingGraphLens || 'all');
    })
    .catch((error) => {
      showOverlay(error.message || 'Graph data unavailable');
    });
}
