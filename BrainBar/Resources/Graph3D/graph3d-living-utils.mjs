export function stableUnit(value) {
  const text = String(value ?? '');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

export function breathingStyle({
  phase = 0,
  nodeId = '',
  baseRadius = 2,
  depth = 1,
  reducedMotion = false
} = {}) {
  const radius = Math.max(0.5, Number(baseRadius) || 0.5);
  const normalizedDepth = clamp(Number(depth) || 1, 0.5, 1.1);
  if (reducedMotion) {
    return {
      offsetX: 0,
      offsetY: 0,
      radius: radius * 0.98,
      fillAlpha: 0.028 * normalizedDepth,
      strokeAlpha: 0.10 * normalizedDepth
    };
  }

  const seed = stableUnit(nodeId);
  const localPhase = Number(phase) + seed * Math.PI * 2;
  const breath = (Math.sin(localPhase * 0.76) + Math.sin(localPhase * 0.43 + 1.7)) * 0.5;
  const drift = 0.78 + normalizedDepth * 0.64;
  return {
    offsetX: Math.cos(localPhase * 0.31 + seed * 3.1) * drift,
    offsetY: Math.sin(localPhase * 0.27 + seed * 5.4) * drift * 0.72,
    radius: radius * (1 + breath * 0.032),
    fillAlpha: (0.028 + (breath + 1) * 0.012) * normalizedDepth,
    strokeAlpha: (0.12 + (breath + 1) * 0.04) * normalizedDepth
  };
}

export function selectAmbientRecentNodeIds({ recentItems = [], visibleNodeIds = new Set(), limit = 24 } = {}) {
  const visible = visibleNodeIds instanceof Set ? visibleNodeIds : new Set(visibleNodeIds || []);
  const ids = [];
  for (const item of recentItems || []) {
    const id = String(item?.id ?? '');
    if (!id || !visible.has(id) || ids.includes(id)) {
      continue;
    }
    ids.push(id);
    if (ids.length >= limit) {
      break;
    }
  }
  return ids;
}

export function createLivingPulse({
  nodeIds = [],
  edgeIds = [],
  originNodeId = null,
  now = 0,
  durationMs = 1100,
  intensity = 1,
  maxNodes = 16,
  maxEdges = 48,
  reducedMotion = false
} = {}) {
  const cappedNodeIds = uniqueStrings(nodeIds).slice(0, Math.max(0, maxNodes));
  const cappedEdgeIds = uniqueStrings(edgeIds).slice(0, Math.max(0, maxEdges));
  return {
    id: `pulse-${Math.round(now)}-${String(originNodeId || cappedNodeIds[0] || 'graph')}`,
    originNodeId: originNodeId ? String(originNodeId) : (cappedNodeIds[0] || null),
    nodeIds: cappedNodeIds,
    edgeIds: cappedEdgeIds,
    startedAt: Number(now) || 0,
    durationMs: reducedMotion ? 1 : clamp(Number(durationMs) || 1100, 300, 1800),
    intensity: clamp(Number(intensity) || 1, 0.15, 1)
  };
}

export function pulseVisualState(pulse, now, { reducedMotion = false } = {}) {
  if (!pulse) {
    return { expired: true, alpha: 0, radiusScale: 1, progress: 1 };
  }
  if (reducedMotion) {
    return { expired: true, alpha: 0, radiusScale: 1, progress: 1 };
  }
  const duration = Math.max(1, Number(pulse.durationMs) || 1);
  const progress = clamp(((Number(now) || 0) - (Number(pulse.startedAt) || 0)) / duration, 0, 1);
  const easeOut = 1 - Math.pow(1 - progress, 3);
  const alpha = (1 - progress) * (Number(pulse.intensity) || 1);
  return {
    expired: progress >= 1,
    alpha,
    radiusScale: 1 + easeOut * 2.6,
    progress
  };
}

export function pruneLivingPulses(pulses = [], now = 0, options = {}) {
  return (pulses || []).filter((pulse) => !pulseVisualState(pulse, now, options).expired);
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    const id = String(value ?? '');
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push(id);
  }
  return result;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
