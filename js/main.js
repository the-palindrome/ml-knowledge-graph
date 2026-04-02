// App initialization and orchestration

import {
  loadGraph, getUpstream, getDownstream,
  getCategoryColor, getCategoryColorHex, getSortedCategories
} from './graph.js';
import * as Renderer from './renderer.js';
import {
  computeForceLayout, computeHierarchicalLayout,
  computeClusterLayout, computeRadialLayout, animateToPositions
} from './layouts.js';
import { setupInteraction } from './interaction.js';
import * as UI from './ui.js';

// --- App state ---
let graph = null;
let currentLayout = 'force';
let selectedNodeId = null;
let selectedNodeIds = new Set();
let hoveredNodeId = null;
let isAnimating = false;
let anchorTooltipOnSelection = false;
let explorerTooltipSize = 'medium';
let container = null;
let videoCaptureCanvas = null;
let videoCaptureContext = null;

const tooltip = document.getElementById('tooltip');
const tooltipLabel = document.getElementById('tooltip-label');
const tooltipShape = document.getElementById('tooltip-shape');
const tooltipBackdropPath = document.getElementById('tooltip-backdrop-path');
const tooltipConnectorPath = document.getElementById('tooltip-connector-path');
const primaryTooltipRef = {
  element: tooltip,
  label: tooltipLabel,
  shape: tooltipShape,
  backdropPath: tooltipBackdropPath,
  connectorPath: tooltipConnectorPath,
  nodeId: null,
  size: 'medium',
  isPrimary: true,
};
const selectionAnchoredTooltipMap = new Map();
const videoTooltipMap = new Map();
const BASE_EDGE_OPACITY = 0.18;
const SELECTED_CONTEXT_EDGE_OPACITY = 0.05;
const SEARCH_EDGE_OPACITY = 0.08;
const NON_FOCUS_NODE_OPACITY = 0.16;
const SEARCH_NON_MATCH_OPACITY = 0.18;
// Keep these highlight edge colors stable for selected path context.
const PREREQUISITES_EDGE_COLOR = '#e8c547';
const DEPENDENTS_EDGE_COLOR = '#6290c3';
const SEARCH_EDGE_COLOR = '#f2f3f5';
const NODE_COLOR_MODE_CATEGORY = 'category';
const NODE_SIZE_MODE_DEFAULT = 'default';
const NODE_METRIC_KEYS = [
  '_pagerank',
  '_degree_centrality',
  '_betweenness_centrality',
  '_descendant_ratio',
  '_prerequisite_ratio',
  '_reachability_ratio',
];
const METRIC_COLOR_HUE_START = 236 / 360;
const METRIC_COLOR_HUE_END = 14 / 360;
const METRIC_COLOR_SATURATION_START = 0.82;
const METRIC_COLOR_SATURATION_END = 0.97;
const METRIC_COLOR_LIGHTNESS_START = 0.48;
const METRIC_COLOR_LIGHTNESS_END = 0.65;
const DEFAULT_NODE_SCALE_FALLBACK_MIN = 1.5;
const DEFAULT_NODE_SCALE_FALLBACK_MAX = 6;
const METRIC_NODE_SCALE_MIN_FACTOR = 0.75;
const METRIC_NODE_SCALE_MAX_FACTOR = 1.9;
const TOOLTIP_MARGIN = 14;
const TOOLTIP_MIN_WIDTH = 120;
const TOOLTIP_CONNECTOR_SOURCE_X = 4;
const TOOLTIP_CONNECTOR_JOINT_X = 22;
const TOOLTIP_ANCHOR_VISIBILITY_PADDING = 24;
const VIDEO_TOOLTIP_SIZE_SMALL = 'small';
const VIDEO_TOOLTIP_SIZE_MEDIUM = 'medium';
const VIDEO_TOOLTIP_SIZE_LARGE = 'large';
const VIDEO_TOOLTIP_SIZE_SCALE = Object.freeze({
  [VIDEO_TOOLTIP_SIZE_SMALL]: 0.84,
  [VIDEO_TOOLTIP_SIZE_MEDIUM]: 1,
  [VIDEO_TOOLTIP_SIZE_LARGE]: 1.24,
});
const VIDEO_TOOLTIP_SIZE_OPTIONS = new Set(Object.keys(VIDEO_TOOLTIP_SIZE_SCALE));
const VIDEO_DURATION_EPSILON = 1e-6;
const VIDEO_ORBIT_TURN_TO_RADIANS = Math.PI * 2;
const VIDEO_TOOLTIP_HIDDEN_OPACITY = 0.001;
const VIDEO_DEFAULT_CAMERA_DURATION = 1.2;
const VIDEO_DEFAULT_ORBIT_DURATION = 4.0;
const VIDEO_DEFAULT_AUTO_ROTATE_SPEED = 0.2;
const VIDEO_CAMERA_EASING_MODES = new Set([
  'smooth',
  'linear',
  'ease-in',
  'ease-out',
  'ease-in-out',
]);
const VIDEO_LAYOUT_OPTIONS = new Set([
  'force',
  'hierarchical',
  'cluster',
  'radial',
]);
const VIDEO_GRAPH_VISIBILITY = {
  CONTEXT: 'context',
  REVEALED: 'revealed',
  HIDDEN: 'hidden',
};
const VIDEO_SUPPORTED_ACTIONS = new Set([
  'selectNode',
  'select',
  'unselectNode',
  'unselect',
  'focusNode',
  'focus',
  'cameraFocus',
  'focusCamera',
  'moveCamera',
  'cameraMove',
  'move',
  'changeLayout',
  'highlightNeighbors',
  'highlightDescendants',
  'highlightDependencies',
  'highlightCategory',
  'highlightDepthGroupNodes',
  'highlightDepthEdges',
  'highlightLowerSlice',
  'highlightUpperSlice',
  'hideGraph',
  'fadeGraph',
  'revealGraph',
  'openTooltip',
  'openNodeTooltip',
  'closeTooltip',
  'closeNodeTooltip',
  'closeAllTooltips',
  'fadeLabel',
  'orbit',
  'autoRotate',
  'rotateCamera',
  'zoomTo',
]);
const VIDEO_ACTION_ALIASES = new Map([
  ['select', 'selectNode'],
  ['unselect', 'unselectNode'],
  ['focus', 'cameraFocus'],
  ['focusCamera', 'cameraFocus'],
  ['cameraMove', 'moveCamera'],
  ['move', 'moveCamera'],
  ['rotateCamera', 'autoRotate'],
  ['openNodeTooltip', 'openTooltip'],
  ['closeNodeTooltip', 'closeTooltip'],
]);
const VIDEO_ACTIONS_REQUIRING_NODE_ID = new Set([
  'selectNode',
  'focusNode',
  'highlightNeighbors',
  'highlightDescendants',
  'highlightDependencies',
  'openTooltip',
  'closeTooltip',
  'fadeLabel',
]);
const VIDEO_CAMERA_TIMELINE_ACTIONS = new Set([
  'focusNode',
  'cameraFocus',
  'moveCamera',
  'orbit',
  'autoRotate',
  'zoomTo',
]);
const VIDEO_SCENE_STATE_ACTIONS = new Set([
  'selectNode',
  'unselectNode',
  'focusNode',
  'changeLayout',
  'highlightNeighbors',
  'highlightDescendants',
  'highlightDependencies',
  'highlightCategory',
  'highlightDepthGroupNodes',
  'highlightDepthEdges',
  'highlightLowerSlice',
  'highlightUpperSlice',
  'hideGraph',
  'fadeGraph',
  'revealGraph',
]);
const VIDEO_ORBIT_ACTIONS = new Set(['orbit', 'autoRotate']);

const pathHighlightState = {
  showPrerequisites: true,
  showDependents: false,
};
let nodeColorMode = NODE_COLOR_MODE_CATEGORY;
let nodeSizeMode = NODE_SIZE_MODE_DEFAULT;
let metricRangeMap = new Map();
let defaultNodeScaleMap = new Map();
let defaultNodeScaleRange = {
  min: DEFAULT_NODE_SCALE_FALLBACK_MIN,
  max: DEFAULT_NODE_SCALE_FALLBACK_MAX,
};
const videoTimelineState = {
  actions: [],
  duration: 0,
  baseCameraState: null,
  baseNodePositions: null,
  baseLayout: 'force',
  cameraEnd: null,
  active: false,
  currentTime: 0,
  appliedSceneVersion: null,
};
let videoNodeLookupMap = null;
let videoCategoryLookupMap = null;

window.addEventListener('resize', () => {
  syncActiveExplorerTooltips();
  if (videoTimelineState.active) {
    const seekState = buildVideoSeekState(videoTimelineState.currentTime);
    syncVideoTooltips(seekState.tooltips);
  }
});

// --- Bootstrap ---

async function init() {
  try {
    graph = await loadGraph('./knowledge_graph.json');
    metricRangeMap = computeMetricRanges(graph.nodes);
    cacheDefaultNodeScales(graph.nodes);
  } catch (err) {
    document.body.innerHTML = `<div style="color:#f88;padding:40px;font-family:sans-serif">
      <h2>Failed to load knowledge graph</h2><p>${err.message}</p></div>`;
    return;
  }

  container = document.getElementById('canvas-container');
  Renderer.initRenderer(container);
  Renderer.setPostRenderCallback(syncActiveExplorerTooltips);
  Renderer.createNodes(graph.nodes);
  Renderer.createEdges(graph.edges);

  const cachedInitialLayout = await loadInitialLayoutCache('./knowledge_graph.layout.json');
  const initialPositions = cachedInitialLayout ?? computeForceLayout(graph.nodes, graph.edges);
  applyPositions(initialPositions);
  Renderer.updatePositions();
  applyAmbientGraphStyle();
  Renderer.fitCameraToGraph();

  // Wire up interaction
  setupInteraction(container, Renderer.getNodeAtScreen, {
    onHover: handleHover,
    onClick: handleClick,
    onDblClick: handleDblClick,
    onEmptyClick: handleEmptyClick,
  });

  // Wire up UI
  UI.updateStats(graph.nodes.length, graph.edges.length);
  UI.setupSearch(handleSearch);
  UI.setupLayoutSelector(handleLayoutChange);
  UI.setupAutoRotate((enabled) => Renderer.setAutoRotate(enabled));
  UI.setupSettingsPanel();
  UI.setupNodeColoring(handleNodeColoringModeChange);
  UI.setupNodeSizing(handleNodeSizingModeChange);
  UI.setupExplorerTooltipSize(handleExplorerTooltipSizeChange);
  UI.setupAnchorTooltipOnSelection(handleAnchorTooltipOnSelectionChange);
  UI.setupShowEdgeDirection(handleShowEdgeDirectionChange);
  UI.setupInfoPanels();
  UI.setupPathHighlightToggles(handlePathHighlightToggleChange);
  UI.setPathHighlightToggleState(pathHighlightState);
  UI.setPathHighlightToggleEnabled(false);
  UI.setupLegend(getSortedCategories(), getCategoryColorHex, handleCategoryClick);
  UI.setupControlsHint();

  // Growth features
  UI.setupShareButtons(
    () => selectedNodeId,
    () => {
      if (!selectedNodeId) return null;
      if (selectedNodeIds.size > 1) {
        return `${selectedNodeIds.size} selected concepts`;
      }
      return graph.nodeMap.get(selectedNodeId)?.label ?? null;
    }
  );
  UI.setupScreenshotButton(() => Renderer.captureScreenshot());

  // Handle deep-link on load
  const hashNodeId = UI.getNodeIdFromHash();
  if (hashNodeId && graph.nodeMap.has(hashNodeId)) {
    // Delay slightly so layout is settled
    setTimeout(() => handleClick(hashNodeId), 300);
  }

  Renderer.startRenderLoop();
}

function applyPositions(positions) {
  for (const node of graph.nodes) {
    const pos = positions.get(node.id);
    if (pos) { node.x = pos.x; node.y = pos.y; node.z = pos.z; }
  }
}

function captureCurrentGraphPositions() {
  const positions = new Map();
  if (!graph?.nodes) return positions;

  for (const node of graph.nodes) {
    positions.set(node.id, {
      x: Number.isFinite(node.x) ? node.x : 0,
      y: Number.isFinite(node.y) ? node.y : 0,
      z: Number.isFinite(node.z) ? node.z : 0,
    });
  }

  return positions;
}

function clonePositionMap(positions) {
  const cloned = new Map();
  if (!(positions instanceof Map)) return cloned;

  for (const [nodeId, pos] of positions.entries()) {
    cloned.set(nodeId, {
      x: Number.isFinite(pos?.x) ? pos.x : 0,
      y: Number.isFinite(pos?.y) ? pos.y : 0,
      z: Number.isFinite(pos?.z) ? pos.z : 0,
    });
  }

  return cloned;
}

function getFirstSetValue(set) {
  return set.values().next().value ?? null;
}

function syncSelectedNodeIdWithSelectionSet() {
  if (!selectedNodeId || !selectedNodeIds.has(selectedNodeId)) {
    selectedNodeId = getFirstSetValue(selectedNodeIds);
  }
}

async function loadInitialLayoutCache(url) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      return null;
    }

    const raw = await response.json();
    const positionsById = raw?.positions && typeof raw.positions === 'object'
      ? raw.positions
      : raw;
    if (!positionsById || typeof positionsById !== 'object') {
      return null;
    }

    const positions = new Map();
    for (const [nodeId, pos] of Object.entries(positionsById)) {
      if (!pos || typeof pos !== 'object') continue;
      const x = Number(pos.x);
      const y = Number(pos.y);
      const z = Number(pos.z);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        continue;
      }
      positions.set(nodeId, { x, y, z });
    }

    return positions.size > 0 ? positions : null;
  } catch {
    return null;
  }
}

async function animateGraphToPositions(positions, duration = 900) {
  Renderer.setAnimationPerformanceMode(true);
  try {
    let animationFrame = 0;
    await animateToPositions(
      graph.nodes,
      positions,
      ({ isFinalFrame }) => {
        animationFrame += 1;
        Renderer.updatePositions({
          updateArrows: false,
          updateEdges: isFinalFrame || animationFrame % 3 === 0,
        });
      },
      duration,
    );
  } finally {
    Renderer.setAnimationPerformanceMode(false);
    Renderer.updatePositions();
  }
}

function computeMetricRanges(nodes) {
  const ranges = new Map();
  for (const key of NODE_METRIC_KEYS) {
    ranges.set(key, {
      min: Number.POSITIVE_INFINITY,
      max: Number.NEGATIVE_INFINITY,
    });
  }

  for (const node of nodes) {
    for (const key of NODE_METRIC_KEYS) {
      const value = node[key];
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      const range = ranges.get(key);
      range.min = Math.min(range.min, value);
      range.max = Math.max(range.max, value);
    }
  }

  for (const key of NODE_METRIC_KEYS) {
    const range = ranges.get(key);
    if (!Number.isFinite(range.min) || !Number.isFinite(range.max)) {
      ranges.set(key, { min: 0, max: 1 });
    }
  }

  return ranges;
}

function cacheDefaultNodeScales(nodes) {
  defaultNodeScaleMap = new Map();
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const node of nodes) {
    const scale = typeof node._baseScale === 'number' && Number.isFinite(node._baseScale)
      ? node._baseScale
      : DEFAULT_NODE_SCALE_FALLBACK_MIN;
    defaultNodeScaleMap.set(node.id, scale);
    min = Math.min(min, scale);
    max = Math.max(max, scale);
  }

  defaultNodeScaleRange = {
    min: Number.isFinite(min) ? min : DEFAULT_NODE_SCALE_FALLBACK_MIN,
    max: Number.isFinite(max) ? max : DEFAULT_NODE_SCALE_FALLBACK_MAX,
  };
}

function isSupportedNodeColorMode(mode) {
  return mode === NODE_COLOR_MODE_CATEGORY || NODE_METRIC_KEYS.includes(mode);
}

function isSupportedNodeSizeMode(mode) {
  return mode === NODE_SIZE_MODE_DEFAULT || NODE_METRIC_KEYS.includes(mode);
}

function normalizeMetricValue(metricKey, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0.5;
  const range = metricRangeMap.get(metricKey);
  if (!range) return 0.5;
  const spread = range.max - range.min;
  if (!Number.isFinite(spread) || spread <= 0) return 0.5;
  const normalized = (value - range.min) / spread;
  return Math.max(0, Math.min(1, normalized));
}

function getScaledNodeBaseSize(metricKey, metricValue) {
  const normalizedValue = normalizeMetricValue(metricKey, metricValue);
  const metricMin = defaultNodeScaleRange.min * METRIC_NODE_SCALE_MIN_FACTOR;
  const metricMax = defaultNodeScaleRange.max * METRIC_NODE_SCALE_MAX_FACTOR;
  const spread = metricMax - metricMin;
  if (!Number.isFinite(spread) || spread <= 0) return metricMin;
  return metricMin + spread * normalizedValue;
}

function applyNodeSizingMode(mode) {
  if (!graph) return;

  if (mode === NODE_SIZE_MODE_DEFAULT) {
    for (const node of graph.nodes) {
      const defaultScale = defaultNodeScaleMap.get(node.id);
      if (typeof defaultScale !== 'number' || !Number.isFinite(defaultScale)) continue;
      node._baseScale = defaultScale;
      node.radius = defaultScale;
    }
    return;
  }

  for (const node of graph.nodes) {
    const scale = getScaledNodeBaseSize(mode, node[mode]);
    node._baseScale = scale;
    node.radius = scale;
  }
}

function getMetricColor(normalizedValue) {
  const t = Math.max(0, Math.min(1, normalizedValue));
  return {
    h: METRIC_COLOR_HUE_START + (METRIC_COLOR_HUE_END - METRIC_COLOR_HUE_START) * t,
    s: METRIC_COLOR_SATURATION_START
      + (METRIC_COLOR_SATURATION_END - METRIC_COLOR_SATURATION_START) * t,
    l: METRIC_COLOR_LIGHTNESS_START
      + (METRIC_COLOR_LIGHTNESS_END - METRIC_COLOR_LIGHTNESS_START) * t,
  };
}

function getNodeBaseColor(node) {
  if (nodeColorMode === NODE_COLOR_MODE_CATEGORY) {
    return getCategoryColor(node.category);
  }

  const normalizedValue = normalizeMetricValue(nodeColorMode, node[nodeColorMode]);
  return getMetricColor(normalizedValue);
}

function getNodeAccentColor(node) {
  return getCategoryColorHex(node.category);
}

function hasActiveSelection() {
  return selectedNodeIds.size > 0;
}

function getSelectionContext(nodeIds = selectedNodeIds) {
  const selectedNodeSet = new Set();
  const prerequisiteSet = new Set();
  const dependentSet = new Set();
  if (!graph) return { selectedNodeSet, prerequisiteSet, dependentSet };

  for (const nodeId of nodeIds) {
    if (graph.nodeMap.has(nodeId)) {
      selectedNodeSet.add(nodeId);
    }
  }

  for (const nodeId of selectedNodeSet) {
    const upstream = getUpstream(nodeId, graph.nodeMap);
    for (const upstreamId of upstream) prerequisiteSet.add(upstreamId);

    const downstream = getDownstream(nodeId, graph.nodeMap);
    for (const downstreamId of downstream) dependentSet.add(downstreamId);
  }

  return { selectedNodeSet, prerequisiteSet, dependentSet };
}

function getBoundedRelationSet(startNodeId, relationKey, maxLevel) {
  const visited = new Set();
  if (!graph || !graph.nodeMap.has(startNodeId)) return visited;

  const levelLimit = Math.max(0, Math.floor(maxLevel));
  const queue = [{ nodeId: startNodeId, depth: 0 }];
  visited.add(startNodeId);

  for (let q = 0; q < queue.length; q++) {
    const current = queue[q];
    if (current.depth >= levelLimit) continue;

    const node = graph.nodeMap.get(current.nodeId);
    if (!node) continue;

    const neighborIds = node[relationKey];
    if (!Array.isArray(neighborIds)) continue;
    for (const neighborId of neighborIds) {
      if (visited.has(neighborId) || !graph.nodeMap.has(neighborId)) continue;
      visited.add(neighborId);
      queue.push({ nodeId: neighborId, depth: current.depth + 1 });
    }
  }

  return visited;
}

function buildVideoDirectionalSelectionContext(selectedIds, rootNodeId, relationKey, level) {
  const selectedNodeSet = new Set();
  const prerequisiteSet = new Set();
  const dependentSet = new Set();

  if (!graph) {
    return { selectedNodeSet, prerequisiteSet, dependentSet };
  }

  for (const nodeId of selectedIds) {
    if (graph.nodeMap.has(nodeId)) {
      selectedNodeSet.add(nodeId);
    }
  }

  for (const nodeId of selectedNodeSet) {
    prerequisiteSet.add(nodeId);
    dependentSet.add(nodeId);
  }

  const boundedRelationSet = getBoundedRelationSet(rootNodeId, relationKey, level);
  if (relationKey === 'from') {
    for (const nodeId of boundedRelationSet) prerequisiteSet.add(nodeId);
  } else {
    for (const nodeId of boundedRelationSet) dependentSet.add(nodeId);
  }

  return { selectedNodeSet, prerequisiteSet, dependentSet };
}

function cloneVideoSelectionContext(selectionContext) {
  return {
    selectedNodeSet: new Set(selectionContext?.selectedNodeSet ?? []),
    prerequisiteSet: new Set(selectionContext?.prerequisiteSet ?? []),
    dependentSet: new Set(selectionContext?.dependentSet ?? []),
  };
}

function buildBaseVideoVisualStyle({
  nodeOpacity = 1,
  edgeOpacity = BASE_EDGE_OPACITY,
} = {}) {
  const colorMap = new Map();
  for (const node of graph.nodes) {
    colorMap.set(node.id, {
      ...getNodeBaseColor(node),
      a: nodeOpacity,
    });
  }

  return {
    colorMap,
    edgeOpacity,
    edgeGroups: [],
  };
}

function buildContextVideoVisualStyle(selectionContext, {
  showPrerequisites = true,
  showDependents = false,
  edgeOpacity = videoTimelineState.active ? 0 : SELECTED_CONTEXT_EDGE_OPACITY,
} = {}) {
  const {
    selectedNodeSet,
    prerequisiteSet,
    dependentSet,
  } = cloneVideoSelectionContext(selectionContext);

  const activeNodeSet = new Set(selectedNodeSet);
  if (showPrerequisites) {
    for (const nodeId of prerequisiteSet) activeNodeSet.add(nodeId);
  }
  if (showDependents) {
    for (const nodeId of dependentSet) activeNodeSet.add(nodeId);
  }

  const colorMap = new Map();
  for (const node of graph.nodes) {
    const isActive = activeNodeSet.has(node.id);
    colorMap.set(node.id, {
      ...(isActive ? getCategoryColor(node.category) : getNodeBaseColor(node)),
      a: isActive ? 1 : NON_FOCUS_NODE_OPACITY,
    });
  }

  const edgeGroups = [];
  if (showPrerequisites) {
    edgeGroups.push({
      nodeSet: prerequisiteSet,
      colorHex: PREREQUISITES_EDGE_COLOR,
      opacity: 0.6,
    });
  }
  if (showDependents) {
    edgeGroups.push({
      nodeSet: dependentSet,
      colorHex: DEPENDENTS_EDGE_COLOR,
      opacity: 0.6,
    });
  }

  return {
    colorMap,
    edgeOpacity,
    edgeGroups,
  };
}

function getVideoSelectionContextForState(state) {
  if (state.contextOverride) {
    return cloneVideoSelectionContext(state.contextOverride);
  }
  return getSelectionContext(state.selectedNodeIds);
}

function buildVideoVisualStyleForState(state) {
  if (state.visibilityMode === VIDEO_GRAPH_VISIBILITY.HIDDEN) {
    return buildBaseVideoVisualStyle({
      nodeOpacity: 0,
      edgeOpacity: 0,
    });
  }

  if (state.visibilityMode === VIDEO_GRAPH_VISIBILITY.CONTEXT && state.selectedNodeIds.size > 0) {
    return buildContextVideoVisualStyle(
      getVideoSelectionContextForState(state),
      {
        showPrerequisites: state.showPrerequisites,
        showDependents: state.showDependents,
      },
    );
  }

  return buildBaseVideoVisualStyle();
}

function serializeVideoEdgeGroupKey(edgeGroup) {
  return [
    edgeGroup.colorHex ?? '',
    edgeGroup.linewidth ?? '',
    [...(edgeGroup.nodeSet ?? [])].sort().join(','),
  ].join('|');
}

function accumulateVideoEdgeGroups(groupMap, groups, factor) {
  if (!Array.isArray(groups) || factor <= VIDEO_DURATION_EPSILON) return;

  for (const group of groups) {
    if (!group?.nodeSet || group.nodeSet.size === 0) continue;
    const opacity = clamp01((group.opacity ?? 0.6) * factor);
    if (opacity <= VIDEO_DURATION_EPSILON) continue;

    const key = serializeVideoEdgeGroupKey(group);
    const existing = groupMap.get(key);
    if (existing) {
      existing.opacity = clamp01(existing.opacity + opacity);
      continue;
    }

    groupMap.set(key, {
      nodeSet: new Set(group.nodeSet),
      colorHex: group.colorHex,
      linewidth: group.linewidth,
      opacity,
    });
  }
}

function blendVideoVisualStyles(fromStyle, toStyle, progress) {
  const t = clamp01(progress);
  const fromResolved = fromStyle ?? buildBaseVideoVisualStyle();
  const toResolved = toStyle ?? buildBaseVideoVisualStyle();
  const colorMap = new Map();

  for (const node of graph.nodes) {
    const fromColor = fromResolved.colorMap?.get(node.id) ?? {
      ...getNodeBaseColor(node),
      a: 1,
    };
    const toColor = toResolved.colorMap?.get(node.id) ?? {
      ...getNodeBaseColor(node),
      a: 1,
    };

    colorMap.set(node.id, {
      h: lerpScalar(fromColor.h, toColor.h, t),
      s: lerpScalar(fromColor.s, toColor.s, t),
      l: lerpScalar(fromColor.l, toColor.l, t),
      a: lerpScalar(fromColor.a, toColor.a, t),
    });
  }

  const edgeGroups = new Map();
  accumulateVideoEdgeGroups(edgeGroups, fromResolved.edgeGroups, 1 - t);
  accumulateVideoEdgeGroups(edgeGroups, toResolved.edgeGroups, t);

  return {
    colorMap,
    edgeOpacity: lerpScalar(fromResolved.edgeOpacity ?? 0, toResolved.edgeOpacity ?? 0, t),
    edgeGroups: [...edgeGroups.values()],
  };
}

function applyVideoVisualStyle(style) {
  const resolvedStyle = style ?? buildBaseVideoVisualStyle();
  Renderer.updateColors(resolvedStyle.colorMap, { animate: false });
  Renderer.updateNodeTransforms({ animateScale: false });
  Renderer.setEdgeOpacity(resolvedStyle.edgeOpacity ?? 0);
  if (resolvedStyle.edgeGroups?.length) {
    Renderer.showHighlightEdgeGroups(resolvedStyle.edgeGroups);
    return;
  }
  Renderer.clearHighlightEdges();
}

function getNodesAtDepthLevel(level) {
  const nodeSet = new Set();
  if (!graph) return nodeSet;

  for (const node of graph.nodes) {
    if (node.depth === level) {
      nodeSet.add(node.id);
    }
  }

  return nodeSet;
}

function getNodesWithinDepthRange(fromDepth, toDepth) {
  const nodeSet = new Set();
  if (!graph) return nodeSet;

  const minDepth = Math.min(fromDepth, toDepth);
  const maxDepth = Math.max(fromDepth, toDepth);
  for (const node of graph.nodes) {
    if (node.depth >= minDepth && node.depth <= maxDepth) {
      nodeSet.add(node.id);
    }
  }

  return nodeSet;
}

function getGraphDepthBounds() {
  if (!graph || !Array.isArray(graph.nodes) || graph.nodes.length === 0) {
    return { minDepth: 0, maxDepth: 0 };
  }

  let minDepth = Number.POSITIVE_INFINITY;
  let maxDepth = Number.NEGATIVE_INFINITY;
  for (const node of graph.nodes) {
    const depth = Number(node.depth);
    if (!Number.isFinite(depth)) continue;
    if (depth < minDepth) minDepth = depth;
    if (depth > maxDepth) maxDepth = depth;
  }

  if (!Number.isFinite(minDepth) || !Number.isFinite(maxDepth)) {
    return { minDepth: 0, maxDepth: 0 };
  }

  return {
    minDepth: Math.floor(minDepth),
    maxDepth: Math.floor(maxDepth),
  };
}

function getSortedNodesByIds(nodeIdSet) {
  return [...nodeIdSet]
    .map((id) => graph.nodeMap.get(id))
    .filter(Boolean)
    .sort((a, b) => a.label.localeCompare(b.label));
}

function getExternalNeighborNodeList(selectedNodeSet, relationKey) {
  const neighborIds = new Set();
  for (const nodeId of selectedNodeSet) {
    const node = graph.nodeMap.get(nodeId);
    if (!node) continue;
    for (const relatedId of node[relationKey]) {
      if (selectedNodeSet.has(relatedId)) continue;
      if (graph.nodeMap.has(relatedId)) neighborIds.add(relatedId);
    }
  }
  return getSortedNodesByIds(neighborIds);
}

function countOutsideSelection(nodeSet, selectionSet) {
  let count = 0;
  for (const nodeId of nodeSet) {
    if (!selectionSet.has(nodeId)) count += 1;
  }
  return count;
}

function updateSelectionInfoPanel(selectionContext) {
  const { selectedNodeSet, prerequisiteSet, dependentSet } = selectionContext;
  if (selectedNodeSet.size === 0) {
    UI.hideInfoPanel();
    return;
  }

  if (selectedNodeSet.size === 1) {
    const nodeId = getFirstSetValue(selectedNodeSet);
    const node = graph.nodeMap.get(nodeId);
    if (!node) return;

    const directPrereqs = getSortedNodesByIds(node.from);
    const directDeps = getSortedNodesByIds(node.to);

    UI.showInfoPanel(
      node,
      prerequisiteSet.size - 1,
      dependentSet.size - 1,
      directPrereqs,
      directDeps,
      getNodeAccentColor(node),
      getCategoryColorHex,
      (clickedId) => handleClick(clickedId),
      (cat) => {
        UI.setSearchValue(cat);
        handleSearch(cat);
      },
    );
    return;
  }

  const selectedNodes = getSortedNodesByIds(selectedNodeSet);
  const directPrereqs = getExternalNeighborNodeList(selectedNodeSet, 'from');
  const directDeps = getExternalNeighborNodeList(selectedNodeSet, 'to');
  const prerequisiteCount = countOutsideSelection(prerequisiteSet, selectedNodeSet);
  const dependentCount = countOutsideSelection(dependentSet, selectedNodeSet);

  UI.showSelectionGroupPanel({
    selectedNodes,
    prerequisiteCount,
    dependentCount,
    directPrereqs,
    directDeps,
    onNodeClick: (clickedId) => handleClick(clickedId),
  });
}

function refreshCurrentVisualState() {
  if (!graph) return;

  const selectionContext = getSelectionContext();
  if (selectionContext.selectedNodeSet.size > 0) {
    selectedNodeIds = selectionContext.selectedNodeSet;
    syncSelectedNodeIdWithSelectionSet();
    applySelectionHighlight(selectionContext, { animateCamera: false });
    return;
  }

  const query = document.getElementById('search').value.trim();
  if (query) {
    applySearchState(query, false);
    return;
  }

  applyAmbientGraphStyle();
  Renderer.updatePositions();
}

function handleNodeColoringModeChange(nextMode) {
  if (!isSupportedNodeColorMode(nextMode) || nextMode === nodeColorMode) return;
  nodeColorMode = nextMode;
  refreshCurrentVisualState();
}

function handleNodeSizingModeChange(nextMode) {
  if (!isSupportedNodeSizeMode(nextMode) || nextMode === nodeSizeMode) return;
  nodeSizeMode = nextMode;
  applyNodeSizingMode(nodeSizeMode);
  refreshCurrentVisualState();
}

function handleExplorerTooltipSizeChange(nextSize) {
  if (!VIDEO_TOOLTIP_SIZE_OPTIONS.has(nextSize) || nextSize === explorerTooltipSize) return;
  explorerTooltipSize = nextSize;
  syncActiveExplorerTooltips();
}

function handleShowEdgeDirectionChange(enabled) {
  Renderer.setEdgeDirectionVisible(enabled);
}

// --- Hover / Tooltips ---

function createTooltipInstance() {
  if (!tooltip) return null;
  const clone = tooltip.cloneNode(true);
  clone.removeAttribute('id');
  clone.classList.remove('visible');
  clone.setAttribute('aria-hidden', 'true');
  clone.style.opacity = '';
  for (const node of clone.querySelectorAll('[id]')) {
    node.removeAttribute('id');
  }
  document.body.appendChild(clone);

  return {
    element: clone,
    label: clone.querySelector('.graph-tooltip-label') ?? clone.querySelector('.tooltip-label'),
    shape: clone.querySelector('.graph-tooltip-shape') ?? clone.querySelector('svg'),
    backdropPath: clone.querySelector('.graph-tooltip-backdrop-path'),
    connectorPath: clone.querySelector('.graph-tooltip-connector-path'),
    nodeId: null,
    size: VIDEO_TOOLTIP_SIZE_MEDIUM,
    isPrimary: false,
  };
}

function destroyTooltipInstance(tooltipRef) {
  if (!tooltipRef || tooltipRef.isPrimary) return;
  tooltipRef.element?.remove();
}

function clearTooltipMap(tooltipMap) {
  for (const [, tooltipRef] of tooltipMap) {
    destroyTooltipInstance(tooltipRef);
  }
  tooltipMap.clear();
}

function getOrCreateTooltip(tooltipMap, nodeId) {
  let tooltipRef = tooltipMap.get(nodeId);
  if (tooltipRef) return tooltipRef;
  tooltipRef = createTooltipInstance();
  if (!tooltipRef) return null;
  tooltipMap.set(nodeId, tooltipRef);
  return tooltipRef;
}

function hideTooltipRef(tooltipRef) {
  if (!tooltipRef?.element) return;
  tooltipRef.element.classList.remove('visible');
  tooltipRef.element.setAttribute('aria-hidden', 'true');
  tooltipRef.element.style.opacity = '';
}

function showTooltipRef(tooltipRef, opacity = 1) {
  if (!tooltipRef?.element) return;
  tooltipRef.element.classList.add('visible');
  tooltipRef.element.setAttribute('aria-hidden', 'false');
  const clampedOpacity = clamp01(opacity);
  tooltipRef.element.style.opacity = clampedOpacity >= 0.999 ? '' : `${clampedOpacity}`;
}

function ensureTooltipLayout(tooltipRef, node, size = VIDEO_TOOLTIP_SIZE_MEDIUM) {
  if (!tooltipRef || !node || !tooltipRef.label) return;
  if (
    tooltipRef.nodeId === node.id
    && tooltipRef.size === size
    && tooltipRef.label.textContent === node.label
  ) {
    return;
  }
  tooltipRef.label.textContent = node.label;
  const normalizedSize = updateHoverTooltipGeometry(tooltipRef, size);
  tooltipRef.nodeId = node.id;
  tooltipRef.size = normalizedSize;
}

function handleAnchorTooltipOnSelectionChange(enabled) {
  anchorTooltipOnSelection = Boolean(enabled);
  if (!anchorTooltipOnSelection) {
    clearTooltipMap(selectionAnchoredTooltipMap);
    if (hoveredNodeId) {
      const hoverAnchor = getHoverTooltipAnchor(hoveredNodeId);
      if (hoverAnchor && graph?.nodeMap.get(hoveredNodeId)) {
        ensureTooltipLayout(primaryTooltipRef, graph.nodeMap.get(hoveredNodeId), explorerTooltipSize);
        positionHoverTooltip(primaryTooltipRef, hoverAnchor.x, hoverAnchor.y);
        showTooltipRef(primaryTooltipRef, 1);
      }
    }
  }
  syncSelectionAnchoredTooltips();
}

function handleHover(nodeId, screenX, screenY) {
  if (hoveredNodeId === nodeId) {
    if (nodeId) {
      const suppressHoverTooltip = anchorTooltipOnSelection && selectedNodeIds.has(nodeId);
      if (suppressHoverTooltip) {
        hideTooltipRef(primaryTooltipRef);
        return;
      }

      const hoverAnchor = getHoverTooltipAnchor(nodeId, screenX, screenY);
      if (hoverAnchor) {
        positionHoverTooltip(primaryTooltipRef, hoverAnchor.x, hoverAnchor.y);
        showTooltipRef(primaryTooltipRef, 1);
      } else {
        hideTooltipRef(primaryTooltipRef);
      }
    }
    return;
  }

  hoveredNodeId = nodeId;

  if (nodeId) {
    const node = graph.nodeMap.get(nodeId);
    const suppressHoverTooltip = anchorTooltipOnSelection && selectedNodeIds.has(nodeId);

    if (!suppressHoverTooltip && node) {
      ensureTooltipLayout(primaryTooltipRef, node, explorerTooltipSize);
      const hoverAnchor = getHoverTooltipAnchor(nodeId, screenX, screenY);
      if (hoverAnchor) {
        positionHoverTooltip(primaryTooltipRef, hoverAnchor.x, hoverAnchor.y);
        showTooltipRef(primaryTooltipRef, 1);
      } else {
        hideTooltipRef(primaryTooltipRef);
      }
    } else {
      hideTooltipRef(primaryTooltipRef);
    }

    container.style.cursor = 'pointer';
  } else {
    hideTooltipRef(primaryTooltipRef);
    container.style.cursor = 'default';
  }
}

function isTooltipAnchorVisible(screenX, screenY, visibilityPadding = 0) {
  if (!container) return false;
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) {
    return false;
  }

  const width = container.clientWidth;
  const height = container.clientHeight;
  if (width <= 0 || height <= 0) {
    return false;
  }

  return (
    screenX >= -visibilityPadding
    && screenX <= width + visibilityPadding
    && screenY >= -visibilityPadding
    && screenY <= height + visibilityPadding
  );
}

function getHoverTooltipAnchor(nodeId, fallbackX, fallbackY) {
  if (nodeId) {
    const projected = Renderer.projectToScreen(nodeId);
    if (
      projected
      && !projected.behind
      && isTooltipAnchorVisible(projected.x, projected.y, TOOLTIP_ANCHOR_VISIBILITY_PADDING)
    ) {
      return {
        x: projected.x,
        y: projected.y,
      };
    }
  }

  if (
    Number.isFinite(fallbackX)
    && Number.isFinite(fallbackY)
    && isTooltipAnchorVisible(fallbackX, fallbackY, TOOLTIP_ANCHOR_VISIBILITY_PADDING)
  ) {
    return {
      x: fallbackX,
      y: fallbackY,
    };
  }

  return null;
}

function syncHoveredTooltipPosition() {
  if (!hoveredNodeId || !primaryTooltipRef.element || primaryTooltipRef.element.getAttribute('aria-hidden') === 'true') {
    return;
  }

  if (anchorTooltipOnSelection && selectedNodeIds.has(hoveredNodeId)) {
    hideTooltipRef(primaryTooltipRef);
    return;
  }

  const hoverAnchor = getHoverTooltipAnchor(hoveredNodeId);
  if (!hoverAnchor) {
    hideTooltipRef(primaryTooltipRef);
    return;
  }

  positionHoverTooltip(primaryTooltipRef, hoverAnchor.x, hoverAnchor.y);
}

function syncSelectionAnchoredTooltips() {
  const shouldAnchorSelection = anchorTooltipOnSelection && !videoTimelineState.active;
  const desiredNodeIds = shouldAnchorSelection ? new Set(selectedNodeIds) : new Set();

  for (const [nodeId, tooltipRef] of selectionAnchoredTooltipMap) {
    if (!desiredNodeIds.has(nodeId)) {
      destroyTooltipInstance(tooltipRef);
      selectionAnchoredTooltipMap.delete(nodeId);
    }
  }

  if (!shouldAnchorSelection || !graph) {
    return;
  }

  for (const nodeId of desiredNodeIds) {
    const node = graph.nodeMap.get(nodeId);
    if (!node) continue;

    const tooltipRef = getOrCreateTooltip(selectionAnchoredTooltipMap, nodeId);
    if (!tooltipRef) continue;

    ensureTooltipLayout(tooltipRef, node, explorerTooltipSize);
    const anchor = getHoverTooltipAnchor(node.id);
    if (!anchor) {
      hideTooltipRef(tooltipRef);
      continue;
    }

    positionHoverTooltip(tooltipRef, anchor.x, anchor.y);
    showTooltipRef(tooltipRef, 1);
  }
}

function syncActiveExplorerTooltips() {
  if (videoTimelineState.active) return;
  syncHoveredTooltipPosition();
  syncSelectionAnchoredTooltips();
}

function getTooltipSizeScale(size = VIDEO_TOOLTIP_SIZE_MEDIUM) {
  return VIDEO_TOOLTIP_SIZE_SCALE[size] ?? VIDEO_TOOLTIP_SIZE_SCALE[VIDEO_TOOLTIP_SIZE_MEDIUM];
}

function applyTooltipVisualSize(tooltipRef, size = VIDEO_TOOLTIP_SIZE_MEDIUM) {
  if (!tooltipRef?.element) return VIDEO_TOOLTIP_SIZE_MEDIUM;
  const normalizedSize = VIDEO_TOOLTIP_SIZE_OPTIONS.has(size)
    ? size
    : VIDEO_TOOLTIP_SIZE_MEDIUM;
  tooltipRef.element.style.setProperty('--tip-size-scale', `${getTooltipSizeScale(normalizedSize)}`);
  return normalizedSize;
}

function updateTooltipConnectorPath(tooltipRef, sourceX, sourceY) {
  if (!tooltipRef?.element || !tooltipRef.connectorPath) {
    return;
  }

  const labelX = Number(tooltipRef.element.dataset.tipLabelX);
  const labelWidth = Number(tooltipRef.element.dataset.tipLabelWidth);
  const baselineY = Number(tooltipRef.element.dataset.tipBaselineY);
  const jointX = Number(tooltipRef.element.dataset.tipJointX);
  const baseSourceX = Number(tooltipRef.element.dataset.tipBaseSourceX);
  const baseSourceY = Number(tooltipRef.element.dataset.tipBaseSourceY);

  if (!Number.isFinite(labelX) || !Number.isFinite(labelWidth) || !Number.isFinite(baselineY)) {
    return;
  }

  const resolvedJointX = Number.isFinite(jointX) ? jointX : TOOLTIP_CONNECTOR_JOINT_X;
  const resolvedSourceX = Number.isFinite(sourceX)
    ? sourceX
    : (Number.isFinite(baseSourceX) ? baseSourceX : TOOLTIP_CONNECTOR_SOURCE_X);
  const resolvedSourceY = Number.isFinite(sourceY)
    ? sourceY
    : (Number.isFinite(baseSourceY) ? baseSourceY : baselineY);

  const connectorPath = [
    `M ${resolvedSourceX} ${resolvedSourceY}`,
    `L ${resolvedJointX} ${baselineY}`,
    `L ${labelX} ${baselineY}`,
    `L ${labelX + labelWidth} ${baselineY}`,
  ].join(' ');

  tooltipRef.connectorPath.setAttribute('d', connectorPath);
  const connectorLength = tooltipRef.connectorPath.getTotalLength();
  tooltipRef.connectorPath.style.setProperty('--path-len', `${connectorLength}`);
}

function updateHoverTooltipGeometry(tooltipRef, size = VIDEO_TOOLTIP_SIZE_MEDIUM) {
  if (!tooltipRef?.element || !tooltipRef.label || !tooltipRef.shape || !tooltipRef.backdropPath || !tooltipRef.connectorPath) {
    return VIDEO_TOOLTIP_SIZE_MEDIUM;
  }

  const normalizedSize = applyTooltipVisualSize(tooltipRef, size);
  const sizeScale = getTooltipSizeScale(normalizedSize);
  const labelX = Math.round(42 * sizeScale);
  const labelY = Math.round(16 * sizeScale);
  const labelWidth = Math.max(1, Math.ceil(tooltipRef.label.offsetWidth));
  const labelHeight = Math.max(1, Math.ceil(tooltipRef.label.offsetHeight));
  const baselineY = labelY + labelHeight + 2;
  const sourceX = Math.round(TOOLTIP_CONNECTOR_SOURCE_X * sizeScale);
  const sourceY = Math.max(Math.round(7 * sizeScale), baselineY - Math.round(34 * sizeScale));
  const jointX = Math.round(TOOLTIP_CONNECTOR_JOINT_X * sizeScale);
  const width = Math.ceil(labelX + labelWidth + Math.round(14 * sizeScale));
  const height = Math.ceil(
    Math.max(
      labelY + labelHeight + Math.round(12 * sizeScale),
      baselineY + Math.round(14 * sizeScale),
    ),
  );

  tooltipRef.element.style.setProperty('--tip-label-x', `${labelX}px`);
  tooltipRef.element.style.setProperty('--tip-label-y', `${labelY}px`);
  tooltipRef.element.style.width = `${width}px`;
  tooltipRef.element.style.height = `${height}px`;

  tooltipRef.shape.setAttribute('viewBox', `0 0 ${width} ${height}`);
  tooltipRef.shape.setAttribute('width', `${width}`);
  tooltipRef.shape.setAttribute('height', `${height}`);

  tooltipRef.element.dataset.tipLabelX = `${labelX}`;
  tooltipRef.element.dataset.tipLabelWidth = `${labelWidth}`;
  tooltipRef.element.dataset.tipBaselineY = `${baselineY}`;
  tooltipRef.element.dataset.tipJointX = `${jointX}`;
  tooltipRef.element.dataset.tipBaseSourceX = `${sourceX}`;
  tooltipRef.element.dataset.tipBaseSourceY = `${sourceY}`;
  updateTooltipConnectorPath(tooltipRef, sourceX, sourceY);

  const inset = 1.5;
  const backdropPath = [
    `M ${inset} ${inset}`,
    `L ${width - inset} ${inset}`,
    `L ${width - inset} ${height - inset}`,
    `L ${inset} ${height - inset}`,
    'Z',
  ].join(' ');
  tooltipRef.backdropPath.setAttribute('d', backdropPath);

  return normalizedSize;
}

function positionHoverTooltip(tooltipRef, screenX, screenY) {
  if (!tooltipRef?.element) {
    return;
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const tooltipWidth = Math.max(tooltipRef.element.offsetWidth, TOOLTIP_MIN_WIDTH);
  const tooltipHeight = Math.max(tooltipRef.element.offsetHeight, 46);
  const baseSourceX = Number(tooltipRef.element.dataset.tipBaseSourceX);
  const baseSourceY = Number(tooltipRef.element.dataset.tipBaseSourceY);
  const sourceX = Number.isFinite(baseSourceX) ? baseSourceX : TOOLTIP_CONNECTOR_SOURCE_X;
  const sourceY = Number.isFinite(baseSourceY) ? baseSourceY : 7;

  const preferredLeft = screenX - sourceX;
  const preferredTop = screenY - sourceY;
  const maxLeft = Math.max(TOOLTIP_MARGIN, viewportWidth - tooltipWidth - TOOLTIP_MARGIN);
  const maxTop = Math.max(TOOLTIP_MARGIN, viewportHeight - tooltipHeight - TOOLTIP_MARGIN);

  const left = Math.min(Math.max(preferredLeft, TOOLTIP_MARGIN), maxLeft);
  const top = Math.min(Math.max(preferredTop, TOOLTIP_MARGIN), maxTop);

  const sourceOffsetX = preferredLeft - left;
  const sourceOffsetY = preferredTop - top;

  tooltipRef.element.style.left = `${left}px`;
  tooltipRef.element.style.top = `${top}px`;
  updateTooltipConnectorPath(tooltipRef, sourceX + sourceOffsetX, sourceY + sourceOffsetY);
}

// --- Click: selection + path highlighting ---

function handleClick(nodeId, options = {}) {
  const {
    appendToSelection = false,
    animateCamera = true,
    updatePermalink = true,
  } = options;

  const node = graph.nodeMap.get(nodeId);
  if (!node) return;

  const shouldToggleSelection = appendToSelection && hasActiveSelection();
  let focusNodeId = nodeId;

  if (shouldToggleSelection) {
    const nextSelectedNodeIds = new Set(selectedNodeIds);
    if (nextSelectedNodeIds.has(nodeId)) {
      nextSelectedNodeIds.delete(nodeId);
      if (nextSelectedNodeIds.size === 0) {
        handleEmptyClick();
        return;
      }

      if (!selectedNodeId || !nextSelectedNodeIds.has(selectedNodeId)) {
        selectedNodeId = getFirstSetValue(nextSelectedNodeIds);
      }
      focusNodeId = selectedNodeId;
    } else {
      nextSelectedNodeIds.add(nodeId);
      selectedNodeId = nodeId;
      focusNodeId = nodeId;
    }
    selectedNodeIds = nextSelectedNodeIds;
  } else {
    selectedNodeIds = new Set([nodeId]);
    selectedNodeId = nodeId;
  }

  if (updatePermalink) {
    UI.updatePermalink(selectedNodeId);
  }

  UI.enableRadialLayout(true);
  UI.setPathHighlightToggleEnabled(true);
  UI.setPathHighlightToggleState(pathHighlightState);

  const selectionContext = getSelectionContext(selectedNodeIds);
  selectedNodeIds = selectionContext.selectedNodeSet;
  applySelectionHighlight(selectionContext, {
    animateCamera: shouldToggleSelection ? false : animateCamera,
    focusNodeId,
  });
}

// --- Double-click: radial layout ---

async function handleDblClick(nodeId) {
  if (isAnimating) return;
  selectedNodeId = nodeId;
  selectedNodeIds = new Set([nodeId]);
  currentLayout = 'radial';
  UI.setActiveLayout('radial');
  UI.enableRadialLayout(true);

  const positions = computeRadialLayout(graph.nodes, nodeId, graph.nodeMap);
  isAnimating = true;
  try {
    await animateGraphToPositions(positions, 900);
  } finally {
    isAnimating = false;
  }

  handleClick(nodeId, { animateCamera: false });
}

// --- Empty click: reset ---

function handleEmptyClick() {
  selectedNodeId = null;
  selectedNodeIds = new Set();
  hoveredNodeId = null;
  UI.updatePermalink(null);
  hideTooltipImmediately();
  syncSelectionAnchoredTooltips();
  resetView();
  UI.hideInfoPanel();
  UI.setPathHighlightToggleEnabled(false);
  UI.enableRadialLayout(false);
}

function resetView() {
  applyAmbientGraphStyle();
  Renderer.updatePositions();
}

// --- Search (matches label OR category per spec §7.2) ---

function handleSearch(query) {
  if (!query) {
    selectedNodeId = null;
    selectedNodeIds = new Set();
    syncSelectionAnchoredTooltips();
    UI.hideInfoPanel();
    UI.setPathHighlightToggleEnabled(false);
    UI.enableRadialLayout(false);
    resetView();
    return;
  }

  selectedNodeId = null;
  selectedNodeIds = new Set();
  syncSelectionAnchoredTooltips();
  UI.hideInfoPanel();
  UI.setPathHighlightToggleEnabled(false);
  applySearchState(query, true);
}

function applySearchState(query, animateSingleMatchCamera) {
  const lower = query.toLowerCase();
  const matchIds = new Set();
  for (const n of graph.nodes) {
    if (n.label.toLowerCase().includes(lower) ||
        (n.category && n.category.toLowerCase().includes(lower))) {
      matchIds.add(n.id);
    }
  }

  const colorMap = new Map();
  for (const n of graph.nodes) {
    const baseColor = getNodeBaseColor(n);
    if (matchIds.has(n.id)) {
      colorMap.set(n.id, { ...baseColor, a: 1 });
    } else {
      colorMap.set(n.id, { ...baseColor, a: SEARCH_NON_MATCH_OPACITY });
    }
    n._currentScale = n._baseScale;
  }

  Renderer.updateColors(colorMap);
  Renderer.updatePositions({ updateEdges: false, updateArrows: false });

  if (matchIds.size > 0 && matchIds.size < graph.nodes.length) {
    Renderer.setEdgeOpacity(SEARCH_EDGE_OPACITY);
    Renderer.showHighlightEdges(matchIds, SEARCH_EDGE_COLOR);
  } else {
    Renderer.setEdgeOpacity(BASE_EDGE_OPACITY);
    Renderer.clearHighlightEdges();
  }

  if (animateSingleMatchCamera && matchIds.size === 1) {
    const id = matchIds.values().next().value;
    const n = graph.nodeMap.get(id);
    Renderer.animateCamera(n.x, n.y, n.z);
  }
}

function applyAmbientGraphStyle(options = {}) {
  applyBaseGraphStyle({
    nodeOpacity: 1,
    edgeOpacity: BASE_EDGE_OPACITY,
    updateNodePositions: false,
    updateNodeTransforms: options.updateNodeTransforms ?? false,
  });
}

function applyBaseGraphStyle({
  nodeOpacity,
  edgeOpacity,
  updateNodePositions,
  updateNodeTransforms = false,
}) {
  const colorMap = new Map();
  for (const n of graph.nodes) {
    const baseColor = getNodeBaseColor(n);
    colorMap.set(n.id, { ...baseColor, a: nodeOpacity });
    n._currentScale = n._baseScale;
  }
  Renderer.updateColors(colorMap);
  if (updateNodePositions) {
    Renderer.updatePositions({ updateEdges: false, updateArrows: false });
  } else if (updateNodeTransforms) {
    Renderer.updateNodeTransforms();
  }
  Renderer.setEdgeOpacity(edgeOpacity);
  Renderer.clearHighlightEdges();
}

function handlePathHighlightToggleChange(nextState) {
  pathHighlightState.showPrerequisites = nextState.showPrerequisites;
  pathHighlightState.showDependents = nextState.showDependents;
  if (!graph || !hasActiveSelection()) return;

  const selectionContext = getSelectionContext();
  selectedNodeIds = selectionContext.selectedNodeSet;
  syncSelectedNodeIdWithSelectionSet();
  applySelectionHighlight(selectionContext, { animateCamera: false });
}

function applySelectionHighlight(selectionContext, options = {}) {
  const {
    animateCamera = false,
    focusNodeId = selectedNodeId,
  } = options;
  const {
    selectedNodeSet,
    prerequisiteSet,
    dependentSet,
  } = selectionContext;
  if (selectedNodeSet.size === 0) return;

  const activeNodeSet = new Set(selectedNodeSet);
  if (pathHighlightState.showPrerequisites) {
    for (const id of prerequisiteSet) activeNodeSet.add(id);
  }
  if (pathHighlightState.showDependents) {
    for (const id of dependentSet) activeNodeSet.add(id);
  }

  const colorMap = new Map();
  for (const n of graph.nodes) {
    const isActive = activeNodeSet.has(n.id);
    const baseColor = isActive ? getCategoryColor(n.category) : getNodeBaseColor(n);
    colorMap.set(n.id, {
      ...baseColor,
      a: isActive ? 1 : NON_FOCUS_NODE_OPACITY,
    });

    n._currentScale = n._baseScale;
  }

  const edgeGroups = [];
  if (pathHighlightState.showPrerequisites) {
    edgeGroups.push({ nodeSet: prerequisiteSet, colorHex: PREREQUISITES_EDGE_COLOR });
  }
  if (pathHighlightState.showDependents) {
    edgeGroups.push({ nodeSet: dependentSet, colorHex: DEPENDENTS_EDGE_COLOR });
  }

  Renderer.updateColors(colorMap);
  Renderer.updateNodeTransforms();
  Renderer.setEdgeOpacity(videoTimelineState.active ? 0 : SELECTED_CONTEXT_EDGE_OPACITY);
  if (edgeGroups.length > 0) {
    Renderer.showHighlightEdgeGroups(edgeGroups);
  } else {
    Renderer.clearHighlightEdges();
  }
  if (!videoTimelineState.active) {
    updateSelectionInfoPanel(selectionContext);
  }

  if (animateCamera) {
    const cameraNodeId = selectedNodeSet.has(focusNodeId)
      ? focusNodeId
      : selectedNodeId;
    const node = graph.nodeMap.get(cameraNodeId);
    if (node) Renderer.animateCamera(node.x, node.y, node.z);
  }

  syncSelectionAnchoredTooltips();
}

// --- Layout change ---

async function handleLayoutChange(layout) {
  if (isAnimating || layout === currentLayout) return;
  isAnimating = true;

  const preservedSelectedNodeId = selectedNodeId;
  const shouldPreserveSelection = selectedNodeIds.size > 0;
  const radialCenterNodeId = preservedSelectedNodeId && selectedNodeIds.has(preservedSelectedNodeId)
    ? preservedSelectedNodeId
    : getFirstSetValue(selectedNodeIds);
  const preservedFilterQuery = document.getElementById('search').value.trim();
  const shouldPreserveFilter = !shouldPreserveSelection && Boolean(preservedFilterQuery);

  if (shouldPreserveSelection) {
    hoveredNodeId = null;
    hideTooltipImmediately();
  } else if (shouldPreserveFilter) {
    hoveredNodeId = null;
    hideTooltipImmediately();
    UI.hideInfoPanel();
  } else {
    handleEmptyClick();
  }

  let positions;
  switch (layout) {
    case 'force':
      positions = computeForceLayout(graph.nodes, graph.edges);
      break;
    case 'hierarchical':
      positions = computeHierarchicalLayout(graph.nodes);
      break;
    case 'cluster':
      positions = computeClusterLayout(graph.nodes);
      break;
    case 'radial':
      if (!radialCenterNodeId) { isAnimating = false; return; }
      positions = computeRadialLayout(graph.nodes, radialCenterNodeId, graph.nodeMap);
      break;
    default:
      isAnimating = false;
      return;
  }

  currentLayout = layout;
  UI.setActiveLayout(layout);

  try {
    await animateGraphToPositions(positions, 900);
  } finally {
    isAnimating = false;
  }

  // Re-apply visuals from live state so cleared/changed selections are respected.
  refreshCurrentVisualState();
}

// --- Category click from legend or info panel ---

function handleCategoryClick(category) {
  UI.setSearchValue(category);
  handleSearch(category);
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNonNegative(value, fallback = 0) {
  return Math.max(0, toFiniteNumber(value, fallback));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, toFiniteNumber(value, 0)));
}

function cloneVec3(vec) {
  return {
    x: toFiniteNumber(vec?.x, 0),
    y: toFiniteNumber(vec?.y, 0),
    z: toFiniteNumber(vec?.z, 0),
  };
}

function addVec3(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subtractVec3(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scaleVec3(v, scalar) {
  return { x: v.x * scalar, y: v.y * scalar, z: v.z * scalar };
}

function vec3Length(v) {
  return Math.sqrt((v.x * v.x) + (v.y * v.y) + (v.z * v.z));
}

function normalizeVec3(v, fallback = { x: 0, y: 0, z: 1 }) {
  const length = vec3Length(v);
  if (length < 1e-9) return cloneVec3(fallback);
  return scaleVec3(v, 1 / length);
}

function lerpScalar(start, end, progress) {
  return start + ((end - start) * progress);
}

function lerpVec3(start, end, progress) {
  return {
    x: lerpScalar(start.x, end.x, progress),
    y: lerpScalar(start.y, end.y, progress),
    z: lerpScalar(start.z, end.z, progress),
  };
}

function rotateVec3ByAxis(v, axis, angleRad) {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  switch (axis) {
    case 'x':
      return {
        x: v.x,
        y: (v.y * cos) - (v.z * sin),
        z: (v.y * sin) + (v.z * cos),
      };
    case 'z':
      return {
        x: (v.x * cos) - (v.y * sin),
        y: (v.x * sin) + (v.y * cos),
        z: v.z,
      };
    case 'y':
    default:
      return {
        x: (v.x * cos) + (v.z * sin),
        y: v.y,
        z: (-v.x * sin) + (v.z * cos),
      };
  }
}

function cloneCameraState(cameraState) {
  if (!cameraState) return null;
  return {
    position: cloneVec3(cameraState.position),
    target: cloneVec3(cameraState.target),
  };
}

function parseVideoVec3(value, fieldName, actionName, index) {
  if (value == null) return null;

  let x;
  let y;
  let z;

  if (Array.isArray(value)) {
    if (value.length < 3) {
      throw new Error(
        `Action "${actionName}" at index ${index} has invalid ${fieldName}; expected [x, y, z].`,
      );
    }
    [x, y, z] = value;
  } else if (typeof value === 'object') {
    x = value.x;
    y = value.y;
    z = value.z;
  } else {
    throw new Error(
      `Action "${actionName}" at index ${index} has invalid ${fieldName}; expected vec3 object.`,
    );
  }

  const normalized = {
    x: Number(x),
    y: Number(y),
    z: Number(z),
  };

  if (!Number.isFinite(normalized.x)
    || !Number.isFinite(normalized.y)
    || !Number.isFinite(normalized.z)) {
    throw new Error(
      `Action "${actionName}" at index ${index} has non-finite ${fieldName} coordinates.`,
    );
  }

  return normalized;
}

function parseVideoLevel(value, actionName, index, fieldName = 'level') {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(
      `Action "${actionName}" at index ${index} has invalid ${fieldName}; expected a non-negative integer.`,
    );
  }
  return parsed;
}

function getVideoCameraDefaultDuration(actionName) {
  if (VIDEO_ORBIT_ACTIONS.has(actionName)) {
    return VIDEO_DEFAULT_ORBIT_DURATION;
  }
  return VIDEO_DEFAULT_CAMERA_DURATION;
}

function getVideoDefaultDuration(actionName) {
  if (isCameraTimelineAction(actionName)) {
    return getVideoCameraDefaultDuration(actionName);
  }
  return 0;
}

function normalizeVideoEasing(rawEasing, actionName, index) {
  if (rawEasing == null) return 'smooth';
  const easing = String(rawEasing).trim().toLowerCase();
  if (!VIDEO_CAMERA_EASING_MODES.has(easing)) {
    throw new Error(
      `Action "${actionName}" at index ${index} has unsupported easing "${rawEasing}".`,
    );
  }
  return easing;
}

function normalizeVideoLayoutName(rawLayout, actionName, index) {
  const layout = String(rawLayout ?? '').trim().toLowerCase();
  if (!VIDEO_LAYOUT_OPTIONS.has(layout)) {
    throw new Error(
      `Action "${actionName}" at index ${index} has invalid layout "${rawLayout}".`,
    );
  }
  return layout;
}

function computeVideoLayoutPositions(layout, options = {}) {
  switch (layout) {
    case 'force':
      return computeForceLayout(graph.nodes, graph.edges);
    case 'hierarchical':
      return computeHierarchicalLayout(graph.nodes);
    case 'cluster':
      return computeClusterLayout(graph.nodes);
    case 'radial':
      return computeRadialLayout(graph.nodes, options.centerNodeId, graph.nodeMap);
    default:
      return null;
  }
}

function easeVideoProgress(progress, easing) {
  const t = clamp01(progress);
  switch (easing) {
    case 'linear':
      return t;
    case 'ease-in':
      return t * t * t;
    case 'ease-out':
      return 1 - ((1 - t) * (1 - t) * (1 - t));
    case 'ease-in-out':
      if (t < 0.5) return 4 * t * t * t;
      return 1 - (Math.pow(-2 * t + 2, 3) / 2);
    case 'smooth':
    default:
      return t * t * (3 - (2 * t));
  }
}

function integrateSmoothStep01(value) {
  const t = clamp01(value);
  return (t * t * t) - (0.5 * t * t * t * t);
}

function applyVideoWindProfileProgress(progress, duration, windUpDuration, windDownDuration) {
  const t = clamp01(progress);
  const totalDuration = Math.max(toFiniteNumber(duration, 0), VIDEO_DURATION_EPSILON);
  let windUp = clampNonNegative(windUpDuration, 0);
  let windDown = clampNonNegative(windDownDuration, 0);

  const combinedWindDuration = windUp + windDown;
  if (combinedWindDuration > totalDuration) {
    const scale = totalDuration / combinedWindDuration;
    windUp *= scale;
    windDown *= scale;
  }

  const windUpFraction = windUp / totalDuration;
  const windDownFraction = windDown / totalDuration;
  if (windUpFraction <= VIDEO_DURATION_EPSILON && windDownFraction <= VIDEO_DURATION_EPSILON) {
    return t;
  }

  const rampEnd = windUpFraction;
  const rampStart = 1 - windDownFraction;
  const totalArea = 1 - (0.5 * (windUpFraction + windDownFraction));

  if (t < rampEnd && windUpFraction > VIDEO_DURATION_EPSILON) {
    const phase = t / windUpFraction;
    const area = windUpFraction * integrateSmoothStep01(phase);
    return area / totalArea;
  }

  if (t <= rampStart) {
    const area = (0.5 * windUpFraction) + (t - rampEnd);
    return area / totalArea;
  }

  if (windDownFraction <= VIDEO_DURATION_EPSILON) {
    return t;
  }

  const remainingPhase = (1 - t) / windDownFraction;
  const remainingArea = windDownFraction * integrateSmoothStep01(remainingPhase);
  const area = totalArea - remainingArea;
  return area / totalArea;
}

function toVideoNodeSlug(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildVideoNodeLookupMap() {
  if (videoNodeLookupMap) return videoNodeLookupMap;
  videoNodeLookupMap = new Map();
  for (const node of graph.nodes) {
    const idKey = String(node.id).trim().toLowerCase();
    if (idKey) videoNodeLookupMap.set(idKey, node.id);

    const labelKey = String(node.label ?? '').trim().toLowerCase();
    if (labelKey && !videoNodeLookupMap.has(labelKey)) {
      videoNodeLookupMap.set(labelKey, node.id);
    }

    const slugKey = toVideoNodeSlug(node.label);
    if (slugKey && !videoNodeLookupMap.has(slugKey)) {
      videoNodeLookupMap.set(slugKey, node.id);
    }
  }
  return videoNodeLookupMap;
}

function buildVideoCategoryLookupMap() {
  if (videoCategoryLookupMap) return videoCategoryLookupMap;
  videoCategoryLookupMap = new Map();

  for (const node of graph.nodes) {
    const category = String(node.category ?? '').trim();
    if (!category) continue;

    const lowerKey = category.toLowerCase();
    if (!videoCategoryLookupMap.has(lowerKey)) {
      videoCategoryLookupMap.set(lowerKey, category);
    }

    const slugKey = toVideoNodeSlug(category);
    if (slugKey && !videoCategoryLookupMap.has(slugKey)) {
      videoCategoryLookupMap.set(slugKey, category);
    }
  }

  return videoCategoryLookupMap;
}

function resolveVideoNodeId(nodeRef) {
  if (typeof nodeRef !== 'string' || nodeRef.trim().length === 0) return null;
  const trimmed = nodeRef.trim();
  if (graph.nodeMap.has(trimmed)) return trimmed;

  const lookup = buildVideoNodeLookupMap();
  const lowerKey = trimmed.toLowerCase();
  const direct = lookup.get(lowerKey);
  if (direct) return direct;

  const slug = toVideoNodeSlug(trimmed);
  return lookup.get(slug) ?? null;
}

function resolveVideoReferencedNode({
  nodeRef,
  fieldName,
  unknownLabel,
  actionName,
  index,
}) {
  if (nodeRef == null) return null;
  if (typeof nodeRef !== 'string' || nodeRef.trim().length === 0) {
    throw new Error(`Action "${actionName}" at index ${index} has invalid ${fieldName}.`);
  }
  const resolved = resolveVideoNodeId(nodeRef);
  if (!resolved) {
    throw new Error(
      `Action "${actionName}" at index ${index} references unknown ${unknownLabel} "${nodeRef}".`,
    );
  }
  return resolved;
}

function resolveVideoCategoryName(categoryRef) {
  if (typeof categoryRef !== 'string' || categoryRef.trim().length === 0) return null;

  const trimmed = categoryRef.trim();
  const lookup = buildVideoCategoryLookupMap();
  const lowerKey = trimmed.toLowerCase();
  const directMatch = lookup.get(lowerKey);
  if (directMatch) return directMatch;

  const slugMatch = lookup.get(toVideoNodeSlug(trimmed));
  if (slugMatch) return slugMatch;

  const substringMatches = new Set();
  for (const category of lookup.values()) {
    if (category.toLowerCase().includes(lowerKey)) {
      substringMatches.add(category);
    }
  }

  return substringMatches.size === 1
    ? substringMatches.values().next().value
    : null;
}

function canonicalVideoActionName(actionName) {
  return VIDEO_ACTION_ALIASES.get(actionName) ?? actionName;
}

function parseVideoScriptVec3(value, fieldName) {
  let x;
  let y;
  let z;

  if (Array.isArray(value)) {
    if (value.length < 3) {
      throw new Error(`Video script "${fieldName}" must provide [x, y, z].`);
    }
    [x, y, z] = value;
  } else if (value && typeof value === 'object') {
    x = value.x;
    y = value.y;
    z = value.z;
  } else {
    throw new Error(`Video script "${fieldName}" must be a vec3 object or [x, y, z].`);
  }

  const normalized = {
    x: Number(x),
    y: Number(y),
    z: Number(z),
  };

  if (!Number.isFinite(normalized.x)
    || !Number.isFinite(normalized.y)
    || !Number.isFinite(normalized.z)) {
    throw new Error(`Video script "${fieldName}" must contain finite coordinates.`);
  }

  return normalized;
}

function parseVideoScriptCameraState(value, fieldName) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Video script "${fieldName}" must be an object with position and target.`);
  }
  if (!('position' in value)) {
    throw new Error(`Video script "${fieldName}" must include a "position" field.`);
  }
  if (!('target' in value)) {
    throw new Error(`Video script "${fieldName}" must include a "target" field.`);
  }

  return {
    position: parseVideoScriptVec3(value.position, `${fieldName}.position`),
    target: parseVideoScriptVec3(value.target, `${fieldName}.target`),
  };
}

function parseVideoScriptInput(scriptInput) {
  if (typeof scriptInput === 'string') {
    return parseVideoScriptInput(JSON.parse(scriptInput));
  }

  if (Array.isArray(scriptInput)) {
    return {
      script: scriptInput,
      cameraStart: null,
      cameraEnd: null,
    };
  }

  if (!scriptInput || typeof scriptInput !== 'object') {
    throw new Error(
      'Video script must be an action array or an object with { script, cameraStart?, cameraEnd? }.',
    );
  }

  if (!Array.isArray(scriptInput.script)) {
    throw new Error('Video script object must include a "script" array of actions.');
  }

  return {
    script: scriptInput.script,
    cameraStart: parseVideoScriptCameraState(scriptInput.cameraStart, 'cameraStart'),
    cameraEnd: parseVideoScriptCameraState(scriptInput.cameraEnd, 'cameraEnd'),
  };
}

function actionRequiresNodeId(actionName) {
  return VIDEO_ACTIONS_REQUIRING_NODE_ID.has(actionName);
}

function isCameraTimelineAction(actionName) {
  return VIDEO_CAMERA_TIMELINE_ACTIONS.has(actionName);
}

function isVideoSceneStateAction(actionName) {
  return VIDEO_SCENE_STATE_ACTIONS.has(actionName);
}

function normalizeVideoTooltipSize(rawSize, actionName, index) {
  if (rawSize == null) return VIDEO_TOOLTIP_SIZE_MEDIUM;
  const size = String(rawSize).trim().toLowerCase();
  if (!VIDEO_TOOLTIP_SIZE_OPTIONS.has(size)) {
    throw new Error(
      `Action "${actionName}" at index ${index} has invalid tooltip size "${rawSize}".`
      + ` Expected one of: ${VIDEO_TOOLTIP_SIZE_SMALL}, ${VIDEO_TOOLTIP_SIZE_MEDIUM}, ${VIDEO_TOOLTIP_SIZE_LARGE}.`,
    );
  }
  return size;
}

function normalizeVideoWindDuration(value, fieldName, actionName, index) {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(
      `Action "${actionName}" at index ${index} has invalid ${fieldName}; expected a non-negative number.`,
    );
  }
  return parsed;
}

function normalizeVideoAction(rawAction, index) {
  if (!rawAction || typeof rawAction !== 'object' || Array.isArray(rawAction)) {
    throw new Error(`Action at index ${index} must be an object.`);
  }

  const declaredActionName = String(rawAction.action ?? '').trim();
  const actionName = canonicalVideoActionName(declaredActionName);
  if (!VIDEO_SUPPORTED_ACTIONS.has(actionName)) {
    throw new Error(`Unsupported video action "${declaredActionName}" at index ${index}.`);
  }

  const isCameraAction = isCameraTimelineAction(actionName);
  const hasExplicitDuration = rawAction.duration != null;
  let duration = getVideoDefaultDuration(actionName);
  if (hasExplicitDuration) {
    const parsedDuration = Number(rawAction.duration);
    if (!Number.isFinite(parsedDuration) || parsedDuration < 0) {
      throw new Error(`Action "${declaredActionName}" at index ${index} has invalid duration.`);
    }
    duration = parsedDuration;
  }

  const normalized = {
    ...rawAction,
    action: actionName,
    at: clampNonNegative(rawAction.at, 0),
    duration,
    _index: index,
  };

  if ('nodeId' in rawAction) {
    if (typeof rawAction.nodeId !== 'string' || rawAction.nodeId.trim().length === 0) {
      throw new Error(`Action "${declaredActionName}" at index ${index} has an invalid nodeId.`);
    }
    normalized.nodeId = resolveVideoNodeId(rawAction.nodeId);
  }

  if (actionRequiresNodeId(actionName) && !normalized.nodeId) {
    throw new Error(`Action "${declaredActionName}" at index ${index} requires a nodeId.`);
  }
  if ('nodeId' in rawAction && !normalized.nodeId) {
    throw new Error(
      `Action "${declaredActionName}" at index ${index} references unknown node "${rawAction.nodeId}".`,
    );
  }

  if (isCameraAction) {
    normalized.easing = normalizeVideoEasing(rawAction.easing, declaredActionName, index);
    if (normalized.duration <= 0) {
      throw new Error(
        `Action "${declaredActionName}" at index ${index} requires duration > 0 for smooth camera movement.`,
      );
    }
  }

  if (VIDEO_ORBIT_ACTIONS.has(actionName)) {
    const axis = String(rawAction.axis ?? 'y').toLowerCase();
    if (axis !== 'x' && axis !== 'y' && axis !== 'z') {
      throw new Error(`Action "${declaredActionName}" at index ${index} has invalid axis "${rawAction.axis}".`);
    }
    normalized.axis = axis;
    const defaultSpeed = actionName === 'autoRotate' ? VIDEO_DEFAULT_AUTO_ROTATE_SPEED : 0;
    normalized.speed = toFiniteNumber(rawAction.speed, defaultSpeed);
    if (actionName === 'autoRotate') {
      normalized.windUp = normalizeVideoWindDuration(
        rawAction.windUp,
        'windUp',
        declaredActionName,
        index,
      ) ?? 0;
      normalized.windDown = normalizeVideoWindDuration(
        rawAction.windDown,
        'windDown',
        declaredActionName,
        index,
      ) ?? 0;
      // Backward compatibility for older scripts that used `ramp: false`.
      if (rawAction.ramp === false) {
        normalized.windUp = 0;
        normalized.windDown = 0;
      }
    }

    const pivot = parseVideoVec3(rawAction.pivot, 'pivot', declaredActionName, index);
    const pivotNodeRef = rawAction.pivotNodeId ?? rawAction.targetNodeId;
    const pivotNodeId = resolveVideoReferencedNode({
      nodeRef: pivotNodeRef,
      fieldName: 'pivotNodeId',
      unknownLabel: 'pivot node',
      actionName: declaredActionName,
      index,
    });
    normalized._cameraPivot = pivot;
    normalized._cameraPivotNodeId = pivotNodeId;
  }

  if (actionName === 'zoomTo') {
    const distance = toFiniteNumber(rawAction.distance, Number.NaN);
    if (!Number.isFinite(distance) || distance <= 0) {
      throw new Error(`Action "zoomTo" at index ${index} must provide a positive distance.`);
    }
    normalized.distance = distance;
  }

  if (actionName === 'cameraFocus') {
    const focusTarget = parseVideoVec3(
      rawAction.target ?? rawAction.lookAt ?? rawAction.point,
      'target',
      declaredActionName,
      index,
    );
    let focusNodeId = normalized.nodeId ?? null;
    const focusNodeRef = rawAction.targetNodeId ?? rawAction.focusNodeId;
    if (!focusNodeId && focusNodeRef != null) {
      focusNodeId = resolveVideoReferencedNode({
        nodeRef: focusNodeRef,
        fieldName: 'targetNodeId',
        unknownLabel: 'target node',
        actionName: declaredActionName,
        index,
      });
    }
    if (!focusNodeId && !focusTarget) {
      throw new Error(
        `Action "${declaredActionName}" at index ${index} requires nodeId/targetNodeId or target coordinates.`,
      );
    }

    normalized._cameraFocusNodeId = focusNodeId;
    normalized._cameraFocusTarget = focusTarget;
    normalized.windUp = normalizeVideoWindDuration(
      rawAction.windUp,
      'windUp',
      declaredActionName,
      index,
    ) ?? (normalized.duration * 0.2);
    normalized.windDown = normalizeVideoWindDuration(
      rawAction.windDown,
      'windDown',
      declaredActionName,
      index,
    ) ?? (normalized.duration * 0.2);

    if (rawAction.distance != null) {
      const distance = Number(rawAction.distance);
      if (!Number.isFinite(distance) || distance <= 0) {
        throw new Error(
          `Action "${declaredActionName}" at index ${index} has invalid distance.`,
        );
      }
      normalized.distance = distance;
    }
  }

  if (actionName === 'moveCamera') {
    const absolutePosition = parseVideoVec3(
      rawAction.position ?? rawAction.to ?? rawAction.cameraPosition,
      'position',
      declaredActionName,
      index,
    );
    const positionDelta = parseVideoVec3(
      rawAction.delta ?? rawAction.offset ?? rawAction.moveBy,
      'delta',
      declaredActionName,
      index,
    );
    const absoluteTarget = parseVideoVec3(
      rawAction.target ?? rawAction.lookAt ?? rawAction.cameraTarget,
      'target',
      declaredActionName,
      index,
    );
    const targetDelta = parseVideoVec3(
      rawAction.targetDelta ?? rawAction.lookAtDelta,
      'targetDelta',
      declaredActionName,
      index,
    );

    const targetNodeRef = rawAction.targetNodeId ?? rawAction.lookAtNodeId;
    const targetNodeId = resolveVideoReferencedNode({
      nodeRef: targetNodeRef,
      fieldName: 'targetNodeId',
      unknownLabel: 'target node',
      actionName: declaredActionName,
      index,
    });

    if (!absolutePosition && !positionDelta && !absoluteTarget && !targetDelta && !targetNodeId) {
      throw new Error(
        `Action "${declaredActionName}" at index ${index} requires position/delta/target information.`,
      );
    }

    normalized._cameraMovePosition = absolutePosition;
    normalized._cameraMoveDelta = positionDelta;
    normalized._cameraMoveTarget = absoluteTarget;
    normalized._cameraMoveTargetDelta = targetDelta;
    normalized._cameraMoveTargetNodeId = targetNodeId;
  }

  if (actionName === 'openTooltip') {
    normalized.opacity = clamp01(rawAction.opacity ?? 1);
    normalized.size = normalizeVideoTooltipSize(rawAction.size, declaredActionName, index);
  }

  if (actionName === 'fadeLabel') {
    normalized.opacity = clamp01(rawAction.opacity ?? 1);
  }

  if (actionName === 'closeTooltip') {
    normalized.opacity = 0;
  }

  if (actionName === 'closeAllTooltips') {
    normalized.opacity = 0;
  }

  if (actionName === 'highlightDescendants' || actionName === 'highlightDependencies') {
    if (!('level' in rawAction)) {
      throw new Error(`Action "${declaredActionName}" at index ${index} requires a level.`);
    }
    normalized.level = parseVideoLevel(rawAction.level, declaredActionName, index);
  }

  if (actionName === 'changeLayout') {
    if (!('duration' in rawAction)) {
      throw new Error(`Action "${declaredActionName}" at index ${index} requires a duration.`);
    }
    normalized.layout = normalizeVideoLayoutName(rawAction.layout, declaredActionName, index);
    normalized.easing = normalizeVideoEasing(rawAction.easing, declaredActionName, index);

    if (normalized.layout === 'radial') {
      const centerNodeRef = rawAction.centerNodeId
        ?? rawAction.nodeId
        ?? rawAction.focusNodeId
        ?? rawAction.targetNodeId;
      normalized._layoutCenterNodeId = resolveVideoReferencedNode({
        nodeRef: centerNodeRef,
        fieldName: 'centerNodeId',
        unknownLabel: 'layout center node',
        actionName: declaredActionName,
        index,
      });
      if (!normalized._layoutCenterNodeId) {
        throw new Error(
          `Action "${declaredActionName}" at index ${index} requires centerNodeId for radial layout.`,
        );
      }
    } else {
      normalized._layoutCenterNodeId = null;
    }

    normalized._layoutPositions = computeVideoLayoutPositions(normalized.layout, {
      centerNodeId: normalized._layoutCenterNodeId,
    });
  }

  if (actionName === 'highlightCategory') {
    if (typeof rawAction.category !== 'string' || rawAction.category.trim().length === 0) {
      throw new Error(`Action "${declaredActionName}" at index ${index} requires a category.`);
    }
    normalized.category = resolveVideoCategoryName(rawAction.category);
    if (!normalized.category) {
      throw new Error(
        `Action "${declaredActionName}" at index ${index} references unknown category "${rawAction.category}".`,
      );
    }
  }

  if (actionName === 'highlightDepthGroupNodes') {
    if (!('level' in rawAction)) {
      throw new Error(`Action "${declaredActionName}" at index ${index} requires a level.`);
    }
    normalized.level = parseVideoLevel(rawAction.level, declaredActionName, index);
  }

  if (actionName === 'highlightDepthEdges') {
    if (!('from' in rawAction)) {
      throw new Error(`Action "${declaredActionName}" at index ${index} requires "from".`);
    }
    if (!('to' in rawAction)) {
      throw new Error(`Action "${declaredActionName}" at index ${index} requires "to".`);
    }
    normalized.from = parseVideoLevel(rawAction.from, declaredActionName, index, 'from');
    normalized.to = parseVideoLevel(rawAction.to, declaredActionName, index, 'to');
    normalized._depthFrom = Math.min(normalized.from, normalized.to);
    normalized._depthTo = Math.max(normalized.from, normalized.to);
  }

  if (actionName === 'highlightLowerSlice') {
    if (!('to' in rawAction)) {
      throw new Error(`Action "${declaredActionName}" at index ${index} requires "to".`);
    }
    normalized.to = parseVideoLevel(rawAction.to, declaredActionName, index, 'to');
  }

  if (actionName === 'highlightUpperSlice') {
    if (!('from' in rawAction)) {
      throw new Error(`Action "${declaredActionName}" at index ${index} requires "from".`);
    }
    normalized.from = parseVideoLevel(rawAction.from, declaredActionName, index, 'from');
  }

  return normalized;
}

function normalizeVideoScript(scriptInput) {
  const parsedScript = parseVideoScriptInput(scriptInput);
  const actions = parsedScript.script
    .map((rawAction, index) => normalizeVideoAction(rawAction, index))
    .sort((a, b) => {
      if (a.at !== b.at) return a.at - b.at;
      return a._index - b._index;
    });

  let activeCameraAnimationEnd = -Infinity;
  let activeLayoutAnimationEnd = -Infinity;
  for (const action of actions) {
    if (!isCameraTimelineAction(action.action) || action.duration <= 0) continue;
    if (action.at + VIDEO_DURATION_EPSILON < activeCameraAnimationEnd) {
      throw new Error(
        `Camera action "${action.action}" at t=${action.at} overlaps a previous camera action.`
          + ' Overlapping camera actions are not supported.',
      );
    }
    activeCameraAnimationEnd = action.at + action.duration;
  }

  for (const action of actions) {
    if (action.action !== 'changeLayout' || action.duration <= 0) continue;
    if (action.at + VIDEO_DURATION_EPSILON < activeLayoutAnimationEnd) {
      throw new Error(
        `Layout action "${action.action}" at t=${action.at} overlaps a previous layout action.`
          + ' Overlapping layout actions are not supported.',
      );
    }
    activeLayoutAnimationEnd = action.at + action.duration;
  }

  return {
    actions,
    cameraStart: parsedScript.cameraStart,
    cameraEnd: parsedScript.cameraEnd,
  };
}

function computeVideoScriptDuration(actions) {
  return actions.reduce(
    (maxDuration, action) => Math.max(maxDuration, action.at + action.duration),
    0,
  );
}

function createInitialVideoSeekState() {
  const fallbackCameraState = Renderer.getCameraState();
  const visualStyle = buildBaseVideoVisualStyle();
  return {
    visibilityMode: VIDEO_GRAPH_VISIBILITY.REVEALED,
    layout: videoTimelineState.baseLayout ?? currentLayout,
    nodePositions: clonePositionMap(videoTimelineState.baseNodePositions ?? captureCurrentGraphPositions()),
    visualStyle,
    selectedNodeIds: new Set(),
    focusNodeId: null,
    showPrerequisites: true,
    showDependents: false,
    contextOverride: null,
    tooltips: new Map(),
    cameraState: cloneCameraState(videoTimelineState.baseCameraState ?? fallbackCameraState),
    sceneVersion: 0,
  };
}

function applyVideoSelectState(state, action) {
  const shouldAppend = Boolean(action.appendToSelection ?? action.append ?? false);
  if (!shouldAppend) {
    state.selectedNodeIds = new Set();
  }
  state.selectedNodeIds.add(action.nodeId);
  state.focusNodeId = action.nodeId;
  state.visibilityMode = VIDEO_GRAPH_VISIBILITY.CONTEXT;
  state.contextOverride = null;

  if (typeof action.showPrerequisites === 'boolean') {
    state.showPrerequisites = action.showPrerequisites;
  }
  if (typeof action.highlightPrerequisites === 'boolean') {
    state.showPrerequisites = action.highlightPrerequisites;
  }
  if (typeof action.showDependents === 'boolean') {
    state.showDependents = action.showDependents;
  }
  if (typeof action.highlightDependents === 'boolean') {
    state.showDependents = action.highlightDependents;
  }
}

function applyVideoUnselectState(state, action) {
  state.contextOverride = null;
  if (action.nodeId) {
    state.selectedNodeIds.delete(action.nodeId);
  } else {
    state.selectedNodeIds.clear();
  }
  if (!state.focusNodeId || !state.selectedNodeIds.has(state.focusNodeId)) {
    state.focusNodeId = getFirstSetValue(state.selectedNodeIds);
  }
}

function getVideoSelectionTransitionProgress(action, progress) {
  if ((action.duration ?? 0) <= 0) return 1;
  return easeVideoProgress(progress, 'smooth');
}

function applyVideoSelectTransitionState(state, action, progress) {
  const previousVisualStyle = state.visualStyle ?? buildVideoVisualStyleForState(state);
  applyVideoSelectState(state, action);
  const nextVisualStyle = buildVideoVisualStyleForState(state);
  state.visualStyle = blendVideoVisualStyles(
    previousVisualStyle,
    nextVisualStyle,
    getVideoSelectionTransitionProgress(action, progress),
  );
}

function applyVideoUnselectTransitionState(state, action, progress) {
  const previousVisualStyle = state.visualStyle ?? buildVideoVisualStyleForState(state);
  applyVideoUnselectState(state, action);
  const nextVisualStyle = buildVideoVisualStyleForState(state);
  state.visualStyle = blendVideoVisualStyles(
    previousVisualStyle,
    nextVisualStyle,
    getVideoSelectionTransitionProgress(action, progress),
  );
}

function applyVideoDirectionalHighlightState(state, action, relationKey) {
  const isDependencies = relationKey === 'from';
  applyVideoSelectState(state, {
    ...action,
    showPrerequisites: isDependencies,
    showDependents: !isDependencies,
  });

  state.contextOverride = buildVideoDirectionalSelectionContext(
    state.selectedNodeIds,
    action.nodeId,
    relationKey,
    action.level,
  );
}

function applyVideoLayoutState(state, action, progress) {
  const startPositions = state.nodePositions instanceof Map
    ? state.nodePositions
    : captureCurrentGraphPositions();
  const targetPositions = action._layoutPositions instanceof Map
    ? action._layoutPositions
    : startPositions;
  const eased = action.duration > 0
    ? easeVideoProgress(progress, action.easing)
    : 1;

  if (eased >= 1 - VIDEO_DURATION_EPSILON) {
    state.nodePositions = clonePositionMap(targetPositions);
  } else {
    const nextPositions = new Map();
    for (const node of graph.nodes) {
      const start = startPositions.get(node.id) ?? {
        x: Number.isFinite(node.x) ? node.x : 0,
        y: Number.isFinite(node.y) ? node.y : 0,
        z: Number.isFinite(node.z) ? node.z : 0,
      };
      const target = targetPositions.get(node.id) ?? start;
      nextPositions.set(node.id, lerpVec3(start, target, eased));
    }
    state.nodePositions = nextPositions;
  }

  state.layout = action.layout;
}

function applyVideoDepthGroupHighlightState(state, action) {
  const depthNodeSet = getNodesAtDepthLevel(action.level);
  state.selectedNodeIds = depthNodeSet;
  state.focusNodeId = getFirstSetValue(depthNodeSet);
  state.visibilityMode = VIDEO_GRAPH_VISIBILITY.CONTEXT;
  state.showPrerequisites = false;
  state.showDependents = false;
  state.contextOverride = {
    selectedNodeSet: depthNodeSet,
    prerequisiteSet: new Set(),
    dependentSet: new Set(),
  };
}

function applyVideoCategoryHighlightState(state, action) {
  const categoryNodeSet = new Set();
  for (const node of graph.nodes) {
    if (node.category === action.category) {
      categoryNodeSet.add(node.id);
    }
  }

  state.selectedNodeIds = categoryNodeSet;
  state.focusNodeId = getFirstSetValue(categoryNodeSet);
  state.visibilityMode = VIDEO_GRAPH_VISIBILITY.CONTEXT;
  state.showPrerequisites = true;
  state.showDependents = false;
  state.contextOverride = {
    selectedNodeSet: categoryNodeSet,
    prerequisiteSet: new Set(categoryNodeSet),
    dependentSet: new Set(),
  };
}

function applyVideoDepthEdgesHighlightState(state, action) {
  const fromDepthNodes = getNodesAtDepthLevel(action._depthFrom);
  const toDepthNodes = getNodesAtDepthLevel(action._depthTo);
  const highlightedRangeNodes = getNodesWithinDepthRange(action._depthFrom, action._depthTo);

  const selectedNodeSet = new Set([
    ...fromDepthNodes,
    ...toDepthNodes,
  ]);
  if (selectedNodeSet.size === 0) {
    for (const nodeId of highlightedRangeNodes) {
      selectedNodeSet.add(nodeId);
    }
  }

  state.selectedNodeIds = selectedNodeSet;
  state.focusNodeId = getFirstSetValue(selectedNodeSet);
  state.visibilityMode = VIDEO_GRAPH_VISIBILITY.CONTEXT;
  state.showPrerequisites = true;
  state.showDependents = false;
  state.contextOverride = {
    selectedNodeSet,
    prerequisiteSet: highlightedRangeNodes,
    dependentSet: new Set(),
  };
}

function applyVideoLowerSliceHighlightState(state, action) {
  const { minDepth } = getGraphDepthBounds();
  const boundaryNodes = getNodesAtDepthLevel(action.to);
  const highlightedRangeNodes = getNodesWithinDepthRange(minDepth, action.to);

  const selectedNodeSet = new Set(boundaryNodes);
  if (selectedNodeSet.size === 0) {
    for (const nodeId of highlightedRangeNodes) {
      selectedNodeSet.add(nodeId);
    }
  }

  state.selectedNodeIds = selectedNodeSet;
  state.focusNodeId = getFirstSetValue(selectedNodeSet);
  state.visibilityMode = VIDEO_GRAPH_VISIBILITY.CONTEXT;
  state.showPrerequisites = true;
  state.showDependents = false;
  state.contextOverride = {
    selectedNodeSet,
    prerequisiteSet: highlightedRangeNodes,
    dependentSet: new Set(),
  };
}

function applyVideoUpperSliceHighlightState(state, action) {
  const { maxDepth } = getGraphDepthBounds();
  const boundaryNodes = getNodesAtDepthLevel(action.from);
  const highlightedRangeNodes = getNodesWithinDepthRange(action.from, maxDepth);

  const selectedNodeSet = new Set(boundaryNodes);
  if (selectedNodeSet.size === 0) {
    for (const nodeId of highlightedRangeNodes) {
      selectedNodeSet.add(nodeId);
    }
  }

  state.selectedNodeIds = selectedNodeSet;
  state.focusNodeId = getFirstSetValue(selectedNodeSet);
  state.visibilityMode = VIDEO_GRAPH_VISIBILITY.CONTEXT;
  state.showPrerequisites = false;
  state.showDependents = true;
  state.contextOverride = {
    selectedNodeSet,
    prerequisiteSet: new Set(),
    dependentSet: highlightedRangeNodes,
  };
}

function getVideoNodePosition(nodeId) {
  if (!nodeId) return null;
  const node = graph.nodeMap.get(nodeId);
  if (!node) return null;
  return { x: node.x, y: node.y, z: node.z };
}

function applyVideoFocusCamera(state, action, progress) {
  if (!state.cameraState) return;

  const targetFromNode = getVideoNodePosition(action._cameraFocusNodeId ?? action.nodeId);
  const targetFromPoint = action._cameraFocusTarget ? cloneVec3(action._cameraFocusTarget) : null;
  const endTarget = targetFromNode ?? targetFromPoint;
  if (!endTarget) return;

  const startCamera = cloneCameraState(state.cameraState);
  const startOffset = subtractVec3(startCamera.position, startCamera.target);
  let endPosition = addVec3(endTarget, startOffset);

  if (action.distance != null) {
    const direction = normalizeVec3(startOffset, { x: 0, y: 0, z: 1 });
    endPosition = addVec3(endTarget, scaleVec3(direction, action.distance));
  }

  const blendedTarget = lerpVec3(startCamera.target, endTarget, progress);
  const blendedPosition = lerpVec3(startCamera.position, endPosition, progress);

  state.cameraState = {
    target: blendedTarget,
    position: blendedPosition,
  };
}

function applyVideoMoveCamera(state, action, progress) {
  if (!state.cameraState) return;

  const startCamera = cloneCameraState(state.cameraState);
  let endPosition = cloneVec3(startCamera.position);
  let endTarget = cloneVec3(startCamera.target);

  if (action._cameraMovePosition) {
    endPosition = cloneVec3(action._cameraMovePosition);
  }
  if (action._cameraMoveDelta) {
    endPosition = addVec3(endPosition, action._cameraMoveDelta);
  }

  const targetFromNode = getVideoNodePosition(action._cameraMoveTargetNodeId);
  if (targetFromNode) {
    endTarget = targetFromNode;
  }
  if (action._cameraMoveTarget) {
    endTarget = cloneVec3(action._cameraMoveTarget);
  }
  if (action._cameraMoveTargetDelta) {
    endTarget = addVec3(endTarget, action._cameraMoveTargetDelta);
  }

  state.cameraState = {
    target: lerpVec3(startCamera.target, endTarget, progress),
    position: lerpVec3(startCamera.position, endPosition, progress),
  };
}

function applyVideoOrbitCamera(state, action, elapsed, progress) {
  if (!state.cameraState || elapsed <= 0) return;

  const startCamera = cloneCameraState(state.cameraState);
  const pivotFromNode = getVideoNodePosition(action._cameraPivotNodeId);
  const pivotFromPoint = action._cameraPivot ? cloneVec3(action._cameraPivot) : null;
  const pivotTarget = pivotFromNode ?? pivotFromPoint ?? startCamera.target;
  const blendedTarget = lerpVec3(startCamera.target, pivotTarget, progress);

  const angle = elapsed * action.speed * VIDEO_ORBIT_TURN_TO_RADIANS;
  const baseOffset = subtractVec3(startCamera.position, startCamera.target);
  const rotatedOffset = rotateVec3ByAxis(baseOffset, action.axis, angle);

  state.cameraState = {
    target: blendedTarget,
    position: addVec3(blendedTarget, rotatedOffset),
  };
}

function applyVideoZoomCamera(state, action, progress) {
  if (!state.cameraState) return;

  const startCamera = cloneCameraState(state.cameraState);
  const cameraDirection = normalizeVec3(
    subtractVec3(startCamera.position, startCamera.target),
    { x: 0, y: 0, z: 1 },
  );
  const endPosition = addVec3(
    startCamera.target,
    scaleVec3(cameraDirection, action.distance),
  );

  state.cameraState = {
    target: startCamera.target,
    position: lerpVec3(startCamera.position, endPosition, progress),
  };
}

function applyVideoTooltipFadeForNode(state, action, progress) {
  if (!action.nodeId) return;

  const existing = state.tooltips.get(action.nodeId) ?? {
    opacity: 0,
    size: VIDEO_TOOLTIP_SIZE_MEDIUM,
  };
  if (action.action === 'openTooltip') {
    existing.size = action.size ?? existing.size ?? VIDEO_TOOLTIP_SIZE_MEDIUM;
  }

  const startOpacity = clamp01(existing.opacity);
  const endOpacity = clamp01(action.opacity ?? 1);
  const nextOpacity = lerpScalar(startOpacity, endOpacity, progress);

  if (progress >= 1 && endOpacity <= VIDEO_TOOLTIP_HIDDEN_OPACITY) {
    state.tooltips.delete(action.nodeId);
    return;
  }

  state.tooltips.set(action.nodeId, {
    ...existing,
    opacity: nextOpacity,
  });
}

function applyVideoCloseAllTooltips(state, progress) {
  if (state.tooltips.size === 0) return;

  for (const [nodeId, tooltipState] of [...state.tooltips.entries()]) {
    const startOpacity = clamp01(tooltipState.opacity);
    const endOpacity = 0;
    const nextOpacity = lerpScalar(startOpacity, endOpacity, progress);

    if (progress >= 1 || nextOpacity <= VIDEO_TOOLTIP_HIDDEN_OPACITY) {
      state.tooltips.delete(nodeId);
      continue;
    }

    state.tooltips.set(nodeId, {
      ...tooltipState,
      opacity: nextOpacity,
    });
  }
}

function applyVideoActionAtTime(state, action, timelineTime) {
  const elapsed = Math.max(0, timelineTime - action.at);
  const hasDuration = action.duration > 0;
  const progress = hasDuration ? Math.min(1, elapsed / action.duration) : 1;
  const cameraProgress = isCameraTimelineAction(action.action)
    ? easeVideoProgress(progress, action.easing)
    : progress;
  const shouldApplyWindProfile = action.action === 'autoRotate' || action.action === 'cameraFocus';
  const rotationProgress = shouldApplyWindProfile
    ? applyVideoWindProfileProgress(cameraProgress, action.duration, action.windUp, action.windDown)
    : cameraProgress;
  const effectiveElapsed = hasDuration ? action.duration * rotationProgress : 0;

  if (isVideoSceneStateAction(action.action)) {
    state.sceneVersion += 1;
  }

  switch (action.action) {
    case 'selectNode':
      applyVideoSelectTransitionState(state, action, progress);
      break;
    case 'unselectNode':
      applyVideoUnselectTransitionState(state, action, progress);
      break;
    case 'focusNode':
      applyVideoSelectState(state, action);
      state.visualStyle = buildVideoVisualStyleForState(state);
      applyVideoFocusCamera(state, action, cameraProgress);
      break;
    case 'cameraFocus':
      applyVideoFocusCamera(state, action, cameraProgress);
      break;
    case 'moveCamera':
      applyVideoMoveCamera(state, action, cameraProgress);
      break;
    case 'changeLayout':
      applyVideoLayoutState(state, action, progress);
      break;
    case 'highlightNeighbors':
      applyVideoSelectState(state, {
        ...action,
        showPrerequisites: true,
        showDependents: true,
      });
      state.visualStyle = buildVideoVisualStyleForState(state);
      break;
    case 'highlightDescendants':
      applyVideoDirectionalHighlightState(state, action, 'to');
      state.visualStyle = buildVideoVisualStyleForState(state);
      break;
    case 'highlightDependencies':
      applyVideoDirectionalHighlightState(state, action, 'from');
      state.visualStyle = buildVideoVisualStyleForState(state);
      break;
    case 'highlightCategory':
      applyVideoCategoryHighlightState(state, action);
      state.visualStyle = buildVideoVisualStyleForState(state);
      break;
    case 'highlightDepthGroupNodes':
      applyVideoDepthGroupHighlightState(state, action);
      state.visualStyle = buildVideoVisualStyleForState(state);
      break;
    case 'highlightDepthEdges':
      applyVideoDepthEdgesHighlightState(state, action);
      state.visualStyle = buildVideoVisualStyleForState(state);
      break;
    case 'highlightLowerSlice':
      applyVideoLowerSliceHighlightState(state, action);
      state.visualStyle = buildVideoVisualStyleForState(state);
      break;
    case 'highlightUpperSlice':
      applyVideoUpperSliceHighlightState(state, action);
      state.visualStyle = buildVideoVisualStyleForState(state);
      break;
    case 'hideGraph':
      state.visibilityMode = VIDEO_GRAPH_VISIBILITY.HIDDEN;
      state.visualStyle = buildVideoVisualStyleForState(state);
      break;
    case 'fadeGraph':
      state.visibilityMode = VIDEO_GRAPH_VISIBILITY.CONTEXT;
      state.visualStyle = buildVideoVisualStyleForState(state);
      break;
    case 'revealGraph':
      state.visibilityMode = VIDEO_GRAPH_VISIBILITY.REVEALED;
      state.visualStyle = buildVideoVisualStyleForState(state);
      break;
    case 'openTooltip':
    case 'closeTooltip':
    case 'fadeLabel':
      applyVideoTooltipFadeForNode(
        state,
        {
          ...action,
          opacity: action.action === 'closeTooltip'
            ? 0
            : (action.opacity ?? 1),
        },
        progress,
      );
      break;
    case 'closeAllTooltips':
      applyVideoCloseAllTooltips(state, progress);
      break;
    case 'orbit':
    case 'autoRotate':
      applyVideoOrbitCamera(state, action, effectiveElapsed, cameraProgress);
      break;
    case 'zoomTo':
      applyVideoZoomCamera(state, action, cameraProgress);
      break;
    default:
      break;
  }
}

function buildVideoSeekState(timelineTime) {
  const state = createInitialVideoSeekState();
  for (const action of videoTimelineState.actions) {
    if (action.at - VIDEO_DURATION_EPSILON > timelineTime) break;
    applyVideoActionAtTime(state, action, timelineTime);
  }
  return state;
}

function hideTooltipImmediately() {
  hideTooltipRef(primaryTooltipRef);
}

function getVideoCaptureCanvas(width, height) {
  if (!videoCaptureCanvas) {
    videoCaptureCanvas = document.createElement('canvas');
    videoCaptureContext = videoCaptureCanvas.getContext('2d');
  }

  if (videoCaptureCanvas.width !== width) {
    videoCaptureCanvas.width = width;
  }
  if (videoCaptureCanvas.height !== height) {
    videoCaptureCanvas.height = height;
  }

  return videoCaptureCanvas;
}

function encodeCanvasToDataUrl(targetCanvas, mimeType = 'image/png', quality) {
  if (typeof targetCanvas.toBlob !== 'function') {
    return Promise.resolve(targetCanvas.toDataURL(mimeType, quality));
  }

  return new Promise((resolve, reject) => {
    targetCanvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas encoding failed.'));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read encoded canvas.'));
      reader.readAsDataURL(blob);
    }, mimeType, quality);
  });
}

function parseCssNumber(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildCanvasFontString(style) {
  const fontParts = [
    style.fontStyle,
    style.fontVariant,
    style.fontWeight,
    style.fontSize,
    style.fontFamily,
  ].filter(Boolean);
  return fontParts.join(' ');
}

function getRenderableTooltipRefs() {
  return [
    primaryTooltipRef,
    ...selectionAnchoredTooltipMap.values(),
    ...videoTooltipMap.values(),
  ].filter((tooltipRef) => Boolean(tooltipRef?.element));
}

function drawSingleTooltipIntoCapture(tooltipRef, sourceCanvas, targetCanvas) {
  if (
    !tooltipRef?.element
    || !tooltipRef.label
    || !tooltipRef.backdropPath
    || !tooltipRef.connectorPath
    || !videoCaptureContext
  ) {
    return false;
  }
  if (tooltipRef.element.getAttribute('aria-hidden') === 'true') {
    return false;
  }

  const tooltipStyles = getComputedStyle(tooltipRef.element);
  const tooltipOpacity = clamp01(parseCssNumber(tooltipStyles.opacity, 1));
  if (tooltipOpacity <= VIDEO_TOOLTIP_HIDDEN_OPACITY) {
    return false;
  }

  const sourceRect = sourceCanvas.getBoundingClientRect();
  const tooltipRect = tooltipRef.element.getBoundingClientRect();
  if (tooltipRect.width <= 0 || tooltipRect.height <= 0 || sourceRect.width <= 0 || sourceRect.height <= 0) {
    return false;
  }

  const scaleX = targetCanvas.width / sourceRect.width;
  const scaleY = targetCanvas.height / sourceRect.height;
  const offsetX = tooltipRect.left - sourceRect.left;
  const offsetY = tooltipRect.top - sourceRect.top;

  const backdropPathData = tooltipRef.backdropPath.getAttribute('d');
  const connectorPathData = tooltipRef.connectorPath.getAttribute('d');
  const backdropStyles = getComputedStyle(tooltipRef.backdropPath);
  const connectorStyles = getComputedStyle(tooltipRef.connectorPath);
  const labelStyles = getComputedStyle(tooltipRef.label);
  const labelOpacity = clamp01(parseCssNumber(labelStyles.opacity, 1));
  const labelText = tooltipRef.label.textContent ?? '';

  videoCaptureContext.save();
  videoCaptureContext.scale(scaleX, scaleY);
  videoCaptureContext.translate(offsetX, offsetY);

  if (backdropPathData) {
    videoCaptureContext.save();
    videoCaptureContext.globalAlpha = tooltipOpacity;
    videoCaptureContext.fillStyle = backdropStyles.fill || 'rgba(3, 6, 12, 0.8)';
    videoCaptureContext.shadowColor = 'rgba(0, 0, 0, 0.42)';
    videoCaptureContext.shadowBlur = 18;
    videoCaptureContext.fill(new Path2D(backdropPathData));
    videoCaptureContext.restore();
  }

  if (connectorPathData) {
    videoCaptureContext.save();
    videoCaptureContext.globalAlpha = tooltipOpacity;
    videoCaptureContext.strokeStyle = connectorStyles.stroke || 'rgba(236, 238, 245, 0.84)';
    videoCaptureContext.lineWidth = parseCssNumber(connectorStyles.strokeWidth, 1.2);
    videoCaptureContext.lineCap = connectorStyles.strokeLinecap || 'round';
    videoCaptureContext.lineJoin = connectorStyles.strokeLinejoin || 'round';
    videoCaptureContext.stroke(new Path2D(connectorPathData));
    videoCaptureContext.restore();
  }

  if (labelText) {
    videoCaptureContext.save();
    videoCaptureContext.globalAlpha = tooltipOpacity * labelOpacity;
    videoCaptureContext.font = buildCanvasFontString(labelStyles);
    videoCaptureContext.fillStyle = labelStyles.color || '#f2f3f5';
    videoCaptureContext.textBaseline = 'top';
    videoCaptureContext.shadowColor = 'rgba(0, 0, 0, 0.52)';
    videoCaptureContext.shadowBlur = 8;
    videoCaptureContext.shadowOffsetX = 0;
    videoCaptureContext.shadowOffsetY = 1;
    videoCaptureContext.fillText(
      labelText,
      parseCssNumber(labelStyles.left, 42),
      parseCssNumber(labelStyles.top, 16),
    );
    videoCaptureContext.restore();
  }

  videoCaptureContext.restore();
  return true;
}

function drawTooltipIntoCapture(sourceCanvas, targetCanvas) {
  let drewTooltip = false;
  for (const tooltipRef of getRenderableTooltipRefs()) {
    drewTooltip = drawSingleTooltipIntoCapture(tooltipRef, sourceCanvas, targetCanvas) || drewTooltip;
  }
  return drewTooltip;
}

function serializeVideoTooltips(tooltipMap) {
  return [...tooltipMap.entries()]
    .map(([nodeId, tooltipState]) => ({
      nodeId,
      opacity: clamp01(tooltipState?.opacity ?? 0),
      size: VIDEO_TOOLTIP_SIZE_OPTIONS.has(tooltipState?.size)
        ? tooltipState.size
        : VIDEO_TOOLTIP_SIZE_MEDIUM,
    }))
    .sort((a, b) => a.nodeId.localeCompare(b.nodeId));
}

function syncVideoTooltips(tooltipMap = new Map()) {
  if (!graph) return;
  const desiredNodeIds = new Set(tooltipMap.keys());

  for (const [nodeId, tooltipRef] of videoTooltipMap) {
    if (!desiredNodeIds.has(nodeId)) {
      destroyTooltipInstance(tooltipRef);
      videoTooltipMap.delete(nodeId);
    }
  }

  for (const [nodeId, tooltipState] of tooltipMap) {
    const node = graph.nodeMap.get(nodeId);
    const clampedOpacity = clamp01(tooltipState?.opacity ?? 0);
    if (!node || clampedOpacity <= VIDEO_TOOLTIP_HIDDEN_OPACITY) {
      const tooltipRef = videoTooltipMap.get(nodeId);
      if (tooltipRef) {
        destroyTooltipInstance(tooltipRef);
        videoTooltipMap.delete(nodeId);
      }
      continue;
    }

    const tooltipRef = getOrCreateTooltip(videoTooltipMap, nodeId);
    if (!tooltipRef) continue;

    const size = VIDEO_TOOLTIP_SIZE_OPTIONS.has(tooltipState?.size)
      ? tooltipState.size
      : VIDEO_TOOLTIP_SIZE_MEDIUM;
    ensureTooltipLayout(tooltipRef, node, size);

    const screenPos = Renderer.projectToScreen(node.id);
    if (!screenPos || screenPos.behind) {
      hideTooltipRef(tooltipRef);
      continue;
    }

    positionHoverTooltip(tooltipRef, screenPos.x, screenPos.y);
    showTooltipRef(tooltipRef, clampedOpacity);
  }
}

function applyVideoSeekStateToScene(state, timelineTime) {
  pathHighlightState.showPrerequisites = state.showPrerequisites;
  pathHighlightState.showDependents = state.showDependents;
  currentLayout = state.layout ?? videoTimelineState.baseLayout ?? currentLayout;

  selectedNodeIds = new Set(state.selectedNodeIds);
  selectedNodeId = selectedNodeIds.has(state.focusNodeId)
    ? state.focusNodeId
    : getFirstSetValue(selectedNodeIds);
  hoveredNodeId = null;
  if (container) container.style.cursor = 'default';
  applyPositions(state.nodePositions ?? videoTimelineState.baseNodePositions ?? captureCurrentGraphPositions());
  Renderer.updatePositions({
    animateScale: false,
    updateEdges: true,
    updateArrows: true,
  });
  applyVideoVisualStyle(state.visualStyle ?? buildVideoVisualStyleForState(state));

  videoTimelineState.appliedSceneVersion = state.sceneVersion;

  if (state.cameraState) {
    Renderer.setCameraState(state.cameraState);
  }
  syncVideoTooltips(state.tooltips);
  Renderer.renderFrame({ updateControls: false });
  videoTimelineState.currentTime = timelineTime;

  return {
    time: timelineTime,
    duration: videoTimelineState.duration,
    selectedNodeIds: [...selectedNodeIds],
    visibilityMode: state.visibilityMode,
    sceneVersion: state.sceneVersion,
    tooltips: serializeVideoTooltips(state.tooltips),
    cameraState: state.cameraState
      ? {
        position: { ...state.cameraState.position },
        target: { ...state.cameraState.target },
      }
      : null,
  };
}

function enableVideoRenderMode() {
  document.body.classList.add('video-render-mode');
  Renderer.setAutoRotate(false);
  Renderer.setDeterministicMode(true);
  Renderer.setRenderLoopPaused(true);
  clearTooltipMap(selectionAnchoredTooltipMap);
  clearTooltipMap(videoTooltipMap);
  applyTooltipVisualSize(primaryTooltipRef, VIDEO_TOOLTIP_SIZE_MEDIUM);
  hideTooltipImmediately();
}

async function runVideoScript(scriptInput) {
  videoNodeLookupMap = null;
  videoCategoryLookupMap = null;
  const normalizedScript = normalizeVideoScript(scriptInput);
  const actions = normalizedScript.actions;
  const fallbackCameraState = cloneCameraState(Renderer.getCameraState());
  const fallbackNodePositions = captureCurrentGraphPositions();
  const cameraStartState = cloneCameraState(
    normalizedScript.cameraStart ?? fallbackCameraState,
  );

  videoTimelineState.actions = actions;
  videoTimelineState.duration = computeVideoScriptDuration(actions);
  videoTimelineState.baseCameraState = cameraStartState;
  videoTimelineState.baseNodePositions = clonePositionMap(fallbackNodePositions);
  videoTimelineState.baseLayout = currentLayout;
  videoTimelineState.cameraEnd = cloneCameraState(normalizedScript.cameraEnd);
  videoTimelineState.active = true;
  videoTimelineState.currentTime = 0;
  videoTimelineState.appliedSceneVersion = null;

  enableVideoRenderMode();
  const initialFrameState = await seekVideoTimeline(0);

  return {
    duration: videoTimelineState.duration,
    actionCount: videoTimelineState.actions.length,
    initialFrameState,
    cameraStart: cloneCameraState(videoTimelineState.baseCameraState),
    cameraEnd: cloneCameraState(videoTimelineState.cameraEnd),
  };
}

async function seekVideoTimeline(timeSeconds) {
  if (!videoTimelineState.active) {
    throw new Error('No video script loaded. Call graphVideo.runScript(script) first.');
  }

  const requestedTime = clampNonNegative(timeSeconds, 0);
  const clampedTime = Math.min(requestedTime, videoTimelineState.duration);
  const nextState = buildVideoSeekState(clampedTime);
  return applyVideoSeekStateToScene(nextState, clampedTime);
}

async function captureVideoFrame(options = {}) {
  if (!videoTimelineState.active) {
    throw new Error('No video script loaded. Call graphVideo.runScript(script) first.');
  }

  const sourceCanvas = container?.querySelector('canvas');
  if (!sourceCanvas) {
    return Renderer.captureScreenshot({
      render: true,
      mimeType: options.mimeType ?? 'image/png',
      quality: options.quality,
    });
  }

  const targetCanvas = getVideoCaptureCanvas(sourceCanvas.width, sourceCanvas.height);
  if (!videoCaptureContext) {
    return Renderer.captureScreenshot({
      render: true,
      mimeType: options.mimeType ?? 'image/png',
      quality: options.quality,
    });
  }

  const captureIntoTargetCanvas = () => {
    Renderer.renderFrame({ updateControls: false });
    videoCaptureContext.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
    videoCaptureContext.drawImage(sourceCanvas, 0, 0, targetCanvas.width, targetCanvas.height);
    drawTooltipIntoCapture(sourceCanvas, targetCanvas);
  };

  captureIntoTargetCanvas();

  return encodeCanvasToDataUrl(
    targetCanvas,
    options.mimeType ?? 'image/png',
    options.quality,
  );
}

async function withInitializedGraph(initPromise, errorMessage, action) {
  await initPromise;
  if (!graph) {
    throw new Error(errorMessage);
  }
  return action();
}

function installGraphVideoApi(initPromise) {
  const withGraph = (errorMessage, action) =>
    withInitializedGraph(initPromise, errorMessage, action);

  window.graphVideo = {
    runScript: (script) =>
      withGraph('Graph failed to initialize. Cannot run video script.', () => runVideoScript(script)),
    seek: (t) =>
      withGraph('Graph failed to initialize. Cannot seek timeline.', () => seekVideoTimeline(t)),
    captureFrame: (options) =>
      withGraph('Graph failed to initialize. Cannot capture frame.', () => captureVideoFrame(options)),
    getDuration() {
      return videoTimelineState.duration;
    },
  };
}

// --- Start ---
const initPromise = init();
installGraphVideoApi(initPromise);
