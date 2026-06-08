#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = require(join(root, 'BrainBar/Resources/Graph2D/brainbar-graph-runtime.js'));
const graph3dPath = await import(pathToFileURL(join(root, 'BrainBar/Resources/Graph3D/graph3d-path-utils.mjs')));
const fixture = JSON.parse(readFileSync(join(root, 'BrainBarTests/Fixtures/graph-runtime-fixture.json'), 'utf8'));

const graphLinks = fixture.edges;

assert.equal(runtime.cleanRelationshipLabel('contains [EXTRACTED]'), '');
assert.equal(runtime.cleanRelationshipLabel('semantic_similarity'), 'semantic similarity');
assert.equal(runtime.sourceFileForNode(fixture.nodes[1]), 'notes/Beta.md');
assert.deepEqual(runtime.nodeActionPayload('openNode', fixture.nodes[0]), {
  action: 'openNode',
  nodeId: 'a',
  label: 'Alpha',
  sourceFile: 'notes/Alpha.md'
});

const edgeDetails = runtime.edgeInspectorDetails(fixture.edges[1], {
  nodes: fixture.nodes,
  graphLinks
});
assert.equal(edgeDetails.provenance, 'Graphify');
assert.equal(edgeDetails.sourceLabel, 'Beta');
assert.equal(edgeDetails.targetLabel, 'Gamma');
assert.equal(edgeDetails.relationship, 'semantic similarity');
assert.equal(edgeDetails.sourceFile, 'notes/Beta.md');

const focusDiff = runtime.computeFocusDiff({
  centerNodeId: 'b',
  depth: 1,
  originalNodes: fixture.nodes,
  originalEdges: fixture.edges,
  currentNodes: fixture.nodes,
  currentEdges: fixture.edges
});
assert.deepEqual(new Set(focusDiff.visibleNodeIds), new Set(['a', 'b', 'c']));
assert.deepEqual(new Set(focusDiff.visibleEdgeIds), new Set(['0', '1']));
assert.deepEqual(focusDiff.nodeUpdates, [{ id: 'd', hidden: true }]);
assert.deepEqual(focusDiff.edgeUpdates, [{ id: 2, hidden: true }]);

const health = runtime.computeGraphHealth({
  nodes: [...fixture.nodes, { id: 'e', label: 'Epsilon', source_file: 'notes/Epsilon.md' }],
  edges: fixture.edges,
  graphLinks
});
assert.equal(health.counts.nodes, 5);
assert.equal(health.counts.edges, 3);
assert.equal(health.counts.wikilinkEdges, 1);
assert.equal(health.counts.graphifyEdges, 2);
assert.deepEqual(health.orphanNodes.map((node) => node.id), ['e']);

assert.equal(runtime.nodeTimestamp({ label: '2026-05-27.md' }) > 0, true);
assert.deepEqual(runtime.recentNodeIds([
  { id: 'old', label: '2026-05-01.md' },
  { id: 'new', label: '2026-05-27.md' },
  { id: 'undated', label: 'Inbox' }
]), ['new', 'old']);

globalThis.__brainBarNodeFileMetadata = {
  byNodeId: {
    recentByMetadata: { source_file: 'notes/Recent.md', mtime: 1780000000 }
  },
  bySourceFile: {}
};
assert.equal(runtime.nodeTimestamp({ id: 'recentByMetadata', label: 'Recent', source_file: 'notes/Recent.md' }), 1780000000000);
delete globalThis.__brainBarNodeFileMetadata;

assert.equal(runtime.describeWorkflowView('orphans').title, 'Needs Links');
assert.equal(runtime.describeWorkflowView('hubs').title, 'Key Notes');

const workflowState = runtime.workflowViewState({
  nodes: [...fixture.nodes, { id: 'e', label: 'Epsilon', source_file: 'notes/Epsilon.md' }],
  edges: fixture.edges,
  graphLinks,
  reviewQueueTargets: []
});
assert.equal(workflowState.orphans.count, 1);
assert.equal(workflowState.hubs.count, 0);
assert.equal(workflowState.review.hidden, true);
assert.equal(workflowState.recent.disabled, true);

const starNodes = [
  { id: 'center', label: 'Center' },
  ...Array.from({ length: 10 }, (_, index) => ({ id: `leaf-${index}`, label: `Leaf ${index}` }))
];
const starEdges = Array.from({ length: 10 }, (_, index) => ({
  id: index,
  from: 'center',
  to: `leaf-${index}`
}));
const hubWorkflowState = runtime.workflowViewState({
  nodes: starNodes,
  edges: starEdges,
  graphLinks: starEdges,
  reviewQueueTargets: [{ node_id: 'center' }]
});
assert.equal(hubWorkflowState.hubs.count, 1);
assert.equal(hubWorkflowState.review.hidden, false);

const pathNodes = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
const pathEdges = [
  { id: 'ab', source: 'a', target: 'b' },
  { id: 'bc', source: 'b', target: 'c' },
  { id: 'cd', source: 'c', target: 'd' }
];
const shortestPath = graph3dPath.computeShortestPath({
  sourceId: 'a',
  targetId: 'd',
  nodes: pathNodes,
  edges: pathEdges
});
assert.equal(shortestPath.found, true);
assert.deepEqual(shortestPath.orderedNodeIds, ['a', 'b', 'c', 'd']);
assert.deepEqual(shortestPath.orderedEdgeIds, ['ab', 'bc', 'cd']);
assert.deepEqual(new Set(shortestPath.nodeIds), new Set(['a', 'b', 'c', 'd']));

const noVisiblePath = graph3dPath.computeShortestPath({
  sourceId: 'a',
  targetId: 'd',
  nodes: pathNodes,
  edges: [{ id: 'ab', source: 'a', target: 'b' }]
});
assert.equal(noVisiblePath.found, false);
assert.equal(noVisiblePath.message, 'No visible path in current view');

const lensFilteredPath = graph3dPath.computeShortestPath({
  sourceId: 'a',
  targetId: 'd',
  nodes: pathNodes.filter((node) => node.id !== 'c'),
  edges: pathEdges
});
assert.equal(lensFilteredPath.found, false);

const explainNodes = [
  { id: 'a', label: 'Alpha', community: 'Community 1' },
  { id: 'b', label: 'Beta', community: 'Community 1' },
  { id: 'c', label: 'Gamma', community: 'Community 2' },
  { id: 'd', label: 'Delta', community: 'Community 3' }
];
const wikilinkExplanation = graph3dPath.explainShortestPath({
  orderedNodeIds: ['a', 'b', 'c'],
  orderedEdgeIds: ['ab', 'bc'],
  nodes: explainNodes,
  edges: [
    { id: 'ab', source: 'a', target: 'b', relation: 'obsidian_wikilink' },
    { id: 'bc', source: 'b', target: 'c', relation: 'obsidian_wikilink' }
  ]
});
assert.equal(wikilinkExplanation.summary, 'This route follows explicit wikilinks between notes.');
assert.ok(wikilinkExplanation.badges.includes('2 Wikilinks'));
assert.equal(wikilinkExplanation.caveat, '');

const graphifyExplanation = graph3dPath.explainShortestPath({
  orderedNodeIds: ['a', 'b', 'c'],
  orderedEdgeIds: ['ab', 'bc'],
  nodes: explainNodes,
  edges: [
    { id: 'ab', source: 'a', target: 'b', relation: 'semantic_similarity' },
    { id: 'bc', source: 'b', target: 'c', context: 'graphify_inferred' }
  ],
  lens: 'graphify'
});
assert.equal(graphifyExplanation.summary, 'This route is inferred from Graphify relationships in the visible graph.');
assert.ok(graphifyExplanation.badges.includes('2 Graphify'));
assert.ok(graphifyExplanation.bullets.some((bullet) => bullet.includes('Graphify lens')));

const mixedExplanation = graph3dPath.explainShortestPath({
  orderedNodeIds: ['a', 'b', 'c', 'd'],
  orderedEdgeIds: ['ab', 'bc', 'cd'],
  nodes: explainNodes,
  edges: [
    { id: 'ab', source: 'a', target: 'b', relation: 'obsidian_wikilink' },
    { id: 'bc', source: 'b', target: 'c', relation: 'semantic_similarity' },
    { id: 'cd', source: 'c', target: 'd', context: 'graphify_inferred' }
  ],
  degreeByNode: new Map([['b', 9], ['c', 3]])
});
assert.equal(mixedExplanation.summary, 'This route combines explicit wikilinks with inferred Graphify relationships.');
assert.ok(mixedExplanation.badges.includes('1 Wikilink'));
assert.ok(mixedExplanation.badges.includes('2 Graphify'));
assert.ok(mixedExplanation.badges.includes('3 communities'));
assert.ok(mixedExplanation.bullets.some((bullet) => bullet.includes('crosses 3 communities')));
assert.ok(mixedExplanation.bullets.some((bullet) => bullet.includes('Beta is the strongest bridge')));

const sparseExplanation = graph3dPath.explainShortestPath({
  orderedNodeIds: ['a', 'b'],
  orderedEdgeIds: ['ab'],
  nodes: explainNodes,
  edges: [{ id: 'ab', source: 'a', target: 'b' }]
});
assert.equal(sparseExplanation.summary, 'BrainBar can trace this route, but the visible graph has limited connection metadata.');
assert.ok(sparseExplanation.badges.includes('1 Unknown'));
assert.ok(sparseExplanation.caveat.includes('metadata is unavailable'));

const graph3dSource = readFileSync(join(root, 'BrainBar/Resources/Graph3D/graph3d.js'), 'utf8');
assert.match(graph3dSource, /function applyFocusOrbit[\s\S]*clearPathMode\(false\)/);

const obsidianDiff = runtime.computeLensDiff({
  lens: 'obsidian',
  originalNodes: fixture.nodes,
  originalEdges: fixture.edges,
  graphLinks,
  currentNodes: fixture.nodes,
  currentEdges: fixture.edges
});
assert.deepEqual(obsidianDiff.edgeUpdates, [
  { id: 1, hidden: true },
  { id: 2, hidden: true }
]);
assert.deepEqual(obsidianDiff.nodeUpdates, [
  { id: 'c', hidden: true },
  { id: 'd', hidden: true }
]);
assert.equal(obsidianDiff.filteredEdgeCount, 1);

const graphifyDiff = runtime.computeLensDiff({
  lens: 'graphify',
  originalNodes: fixture.nodes,
  originalEdges: fixture.edges,
  graphLinks,
  currentNodes: fixture.nodes,
  currentEdges: fixture.edges
});
assert.deepEqual(graphifyDiff.edgeUpdates, [{ id: 0, hidden: true }]);
assert.deepEqual(graphifyDiff.nodeUpdates, [{ id: 'a', hidden: true }]);
assert.equal(graphifyDiff.filteredEdgeCount, 2);

const alreadyApplied = runtime.computeLensDiff({
  lens: 'obsidian',
  originalNodes: fixture.nodes,
  originalEdges: fixture.edges,
  graphLinks,
  currentNodes: fixture.nodes.map((node) => ({
    ...node,
    hidden: node.id === 'c' || node.id === 'd'
  })),
  currentEdges: fixture.edges.map((edge) => ({
    ...edge,
    hidden: edge.id === 1 || edge.id === 2
  }))
});
assert.deepEqual(alreadyApplied.edgeUpdates, []);
assert.deepEqual(alreadyApplied.nodeUpdates, []);

const resetAll = runtime.computeLensDiff({
  lens: 'all',
  originalNodes: fixture.nodes,
  originalEdges: fixture.edges,
  graphLinks,
  currentNodes: fixture.nodes.map((node) => ({ ...node, hidden: true })),
  currentEdges: fixture.edges.map((edge) => ({ ...edge, hidden: true }))
});
assert.equal(resetAll.edgeUpdates.length, fixture.edges.length);
assert.equal(resetAll.nodeUpdates.length, fixture.nodes.length);
assert.ok(resetAll.edgeUpdates.every((update) => update.hidden === false));
assert.ok(resetAll.nodeUpdates.every((update) => update.hidden === false));

[
  'BrainBar/Resources/Graph3D/index.html',
  'BrainBar/Resources/Graph3D/graph3d.css',
  'BrainBar/Resources/Graph3D/graph3d.js',
  'BrainBar/Resources/Graph3D/graph3d-path-utils.mjs',
  'BrainBar/Resources/Graph3D/vendor/three.module.min.js',
  'BrainBar/Resources/Graph3D/vendor/OrbitControls.js'
].forEach((relativePath) => {
  assert.ok(existsSync(join(root, relativePath)), `Missing ${relativePath}`);
});

console.log('Graph runtime smoke tests passed.');
