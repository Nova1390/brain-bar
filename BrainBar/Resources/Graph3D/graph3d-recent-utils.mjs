import { computeShortestPath } from './graph3d-path-utils.mjs';

export function sourceFileForNode(node) {
  return String(node?.sourceFile || node?.source_file || node?._source_file || node?.file || '');
}

export function fileMetadataForNode(node, metadata = globalThis.__brainBarNodeFileMetadata || {}) {
  const byNodeId = metadata.byNodeId || {};
  const bySourceFile = metadata.bySourceFile || {};
  const sourceFile = sourceFileForNode(node);
  return byNodeId[String(node?.id)] || (sourceFile ? bySourceFile[sourceFile] : null) || {};
}

export function nodeTimestamp(node, metadata = globalThis.__brainBarNodeFileMetadata || {}) {
  const fileMetadata = fileMetadataForNode(node, metadata);
  const sourceFile = sourceFileForNode(node);
  const explicit = node?.mtime || node?.modified_at || node?.modifiedAt || fileMetadata.mtime || fileMetadata.modifiedAt;
  if (explicit) {
    if (typeof explicit === 'number') {
      return explicit > 10000000000 ? explicit : explicit * 1000;
    }
    const parsed = Date.parse(explicit);
    return Number.isNaN(parsed) ? Number(explicit) || 0 : parsed;
  }

  const haystack = [
    node?.label,
    node?.title,
    node?.id,
    sourceFile
  ].map((value) => String(value || '')).join(' ');
  const dashed = haystack.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (dashed) {
    return Date.parse(`${dashed[1]}-${dashed[2]}-${dashed[3]}T00:00:00Z`) || 0;
  }
  const compact = haystack.match(/\b(20\d{2})(\d{2})(\d{2})\b/);
  if (compact) {
    return Date.parse(`${compact[1]}-${compact[2]}-${compact[3]}T00:00:00Z`) || 0;
  }
  return 0;
}

export function recentOrbitCandidates({ nodes = [], metadata, limit = 24 } = {}) {
  return (nodes || [])
    .map((node) => ({
      node,
      id: String(node?.id ?? ''),
      label: String(node?.label || node?.title || node?.id || 'Untitled'),
      sourceFile: sourceFileForNode(node),
      timestamp: nodeTimestamp(node, metadata)
    }))
    .filter((item) => item.id && item.timestamp > 0)
    .sort((left, right) => right.timestamp - left.timestamp || left.label.localeCompare(right.label))
    .slice(0, limit);
}

export function keyNoteCandidates({ nodes = [], degreeByNode = new Map(), excludeNodeId = '', limit = 12 } = {}) {
  const excluded = String(excludeNodeId || '');
  return (nodes || [])
    .map((node) => ({
      node,
      id: String(node?.id ?? ''),
      degree: degreeForNode(node?.id, degreeByNode)
    }))
    .filter((item) => item.id && item.id !== excluded && item.degree > 0)
    .sort((left, right) => right.degree - left.degree || String(left.node?.label || left.id).localeCompare(String(right.node?.label || right.id)))
    .slice(0, limit);
}

export function nearestKeyNotePath({
  sourceId,
  nodes = [],
  edges = [],
  degreeByNode = new Map(),
  keyNoteLimit = 12
} = {}) {
  const source = String(sourceId || '');
  const keyNotes = keyNoteCandidates({
    nodes,
    degreeByNode,
    excludeNodeId: source,
    limit: keyNoteLimit
  });
  const candidates = keyNotes
    .map((keyNote) => ({
      keyNote,
      path: computeShortestPath({
        sourceId: source,
        targetId: keyNote.id,
        nodes,
        edges
      })
    }))
    .filter((item) => item.path.found);

  if (!candidates.length) {
    return {
      found: false,
      message: 'No visible path to a key note in current view',
      targetId: null,
      targetDegree: 0,
      orderedNodeIds: [],
      orderedEdgeIds: [],
      nodeIds: new Set(source ? [source] : []),
      edgeIds: new Set()
    };
  }

  const best = candidates.sort((left, right) => {
    const stepDelta = left.path.orderedNodeIds.length - right.path.orderedNodeIds.length;
    if (stepDelta !== 0) {
      return stepDelta;
    }
    const degreeDelta = right.keyNote.degree - left.keyNote.degree;
    if (degreeDelta !== 0) {
      return degreeDelta;
    }
    return String(left.keyNote.node?.label || left.keyNote.id).localeCompare(String(right.keyNote.node?.label || right.keyNote.id));
  })[0];

  return {
    ...best.path,
    targetId: best.keyNote.id,
    targetDegree: best.keyNote.degree,
    message: ''
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
