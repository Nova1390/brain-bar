#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = require(join(root, 'BrainBar/Resources/Graph2D/brainbar-graph-runtime.js'));
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
  'BrainBar/Resources/Graph3D/vendor/three.module.min.js',
  'BrainBar/Resources/Graph3D/vendor/OrbitControls.js'
].forEach((relativePath) => {
  assert.ok(existsSync(join(root, relativePath)), `Missing ${relativePath}`);
});

console.log('Graph runtime smoke tests passed.');
