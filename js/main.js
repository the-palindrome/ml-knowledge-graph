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
let container = null;

const tooltip = document.getElementById('tooltip');
const tooltipLabel = document.getElementById('tooltip-label');
const tooltipShape = document.getElementById('tooltip-shape');
const tooltipBackdropPath = document.getElementById('tooltip-backdrop-path');
const tooltipConnectorPath = document.getElementById('tooltip-connector-path');
const BASE_EDGE_OPACITY = 0.32;
const SELECTED_CONTEXT_EDGE_OPACITY = 0.06;
const SEARCH_EDGE_OPACITY = 0.09;
const NON_FOCUS_NODE_OPACITY = 0.16;
const SEARCH_NON_MATCH_OPACITY = 0.18;
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
const METRIC_COLOR_HUE_START = 218 / 360;
const METRIC_COLOR_HUE_END = 22 / 360;
const METRIC_COLOR_SATURATION_START = 0.74;
const METRIC_COLOR_SATURATION_END = 0.92;
const METRIC_COLOR_LIGHTNESS_START = 0.42;
const METRIC_COLOR_LIGHTNESS_END = 0.66;
const DEFAULT_NODE_SCALE_FALLBACK_MIN = 1.5;
const DEFAULT_NODE_SCALE_FALLBACK_MAX = 6;
const METRIC_NODE_SCALE_MIN_FACTOR = 0.75;
const METRIC_NODE_SCALE_MAX_FACTOR = 1.9;
const TOOLTIP_MARGIN = 14;
const TOOLTIP_MIN_WIDTH = 120;
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
  'highlightNeighbors',
  'hideGraph',
  'fadeGraph',
  'revealGraph',
  'openTooltip',
  'openNodeTooltip',
  'closeTooltip',
  'closeNodeTooltip',
  'fadeLabel',
  'orbit',
  'autoRotate',
  'rotateCamera',
  'zoomTo',
]);

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
  active: false,
  currentTime: 0,
};
let videoNodeLookupMap = null;

window.addEventListener('resize', () => {
  if (!hoveredNodeId) return;
  updateHoverTooltipGeometry();
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
  Renderer.createNodes(graph.nodes);
  Renderer.createEdges(graph.edges, graph.nodes);

  // Compute initial force layout
  const forcePositions = computeForceLayout(graph.nodes, graph.edges);
  applyPositions(forcePositions);
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
    const nodeId = selectedNodeSet.values().next().value;
    const node = graph.nodeMap.get(nodeId);
    if (!node) return;

    const directPrereqs = node.from
      .map((id) => graph.nodeMap.get(id))
      .filter(Boolean)
      .sort((a, b) => a.label.localeCompare(b.label));
    const directDeps = node.to
      .map((id) => graph.nodeMap.get(id))
      .filter(Boolean)
      .sort((a, b) => a.label.localeCompare(b.label));

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
    if (!selectedNodeId || !selectedNodeIds.has(selectedNodeId)) {
      selectedNodeId = selectedNodeIds.values().next().value ?? null;
    }
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

// --- Hover ---

function handleHover(nodeId, screenX, screenY) {
  if (hoveredNodeId === nodeId) {
    if (nodeId) {
      positionHoverTooltip(screenX, screenY);
    }
    return;
  }

  // Restore previous hover
  if (hoveredNodeId && !hasActiveSelection()) {
    const prev = graph.nodeMap.get(hoveredNodeId);
    if (prev) {
      prev._currentScale = prev._hoverRestoreScale ?? prev._baseScale;
      prev._hoverRestoreScale = null;
    }
  }

  hoveredNodeId = nodeId;

  if (nodeId) {
    const node = graph.nodeMap.get(nodeId);
    if (tooltipLabel) {
      tooltipLabel.textContent = node.label;
      updateHoverTooltipGeometry();
    }
    positionHoverTooltip(screenX, screenY);
    tooltip.classList.add('visible');
    tooltip.setAttribute('aria-hidden', 'false');
    tooltip.style.opacity = '';

    if (!hasActiveSelection()) {
      node._hoverRestoreScale = node._currentScale;
      node._currentScale = node._currentScale * 1.35;
      Renderer.updatePositions();
    }

    container.style.cursor = 'pointer';
  } else {
    tooltip.classList.remove('visible');
    tooltip.setAttribute('aria-hidden', 'true');
    tooltip.style.opacity = '';
    if (!hasActiveSelection()) Renderer.updatePositions();
    container.style.cursor = 'default';
  }
}

function updateHoverTooltipGeometry() {
  if (!tooltip || !tooltipLabel || !tooltipShape || !tooltipBackdropPath || !tooltipConnectorPath) {
    return;
  }

  const labelX = 42;
  const labelY = 16;
  const labelWidth = Math.max(1, Math.ceil(tooltipLabel.offsetWidth));
  const labelHeight = Math.max(1, Math.ceil(tooltipLabel.offsetHeight));
  const baselineY = labelY + labelHeight + 2;
  const sourceX = 4;
  const sourceY = Math.max(7, baselineY - 34);
  const jointX = 22;
  const width = Math.ceil(labelX + labelWidth + 14);
  const height = Math.ceil(Math.max(labelY + labelHeight + 12, baselineY + 14));

  tooltip.style.setProperty('--tip-label-x', `${labelX}px`);
  tooltip.style.setProperty('--tip-label-y', `${labelY}px`);
  tooltip.style.width = `${width}px`;
  tooltip.style.height = `${height}px`;

  tooltipShape.setAttribute('viewBox', `0 0 ${width} ${height}`);
  tooltipShape.setAttribute('width', `${width}`);
  tooltipShape.setAttribute('height', `${height}`);

  const connectorPath = [
    `M ${sourceX} ${sourceY}`,
    `L ${jointX} ${baselineY}`,
    `L ${labelX} ${baselineY}`,
    `L ${labelX + labelWidth} ${baselineY}`,
  ].join(' ');
  tooltipConnectorPath.setAttribute('d', connectorPath);

  const inset = 1.5;
  const backdropPath = [
    `M ${inset} ${inset}`,
    `L ${width - inset} ${inset}`,
    `L ${width - inset} ${height - inset}`,
    `L ${inset} ${height - inset}`,
    'Z',
  ].join(' ');
  tooltipBackdropPath.setAttribute('d', backdropPath);

  const connectorLength = tooltipConnectorPath.getTotalLength();
  tooltipConnectorPath.style.setProperty('--path-len', `${connectorLength}`);
}

function positionHoverTooltip(screenX, screenY) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const tooltipWidth = Math.max(tooltip.offsetWidth, TOOLTIP_MIN_WIDTH);
  const tooltipHeight = Math.max(tooltip.offsetHeight, 46);

  let left = screenX + 6;
  let top = screenY - 6;

  left = Math.min(left, viewportWidth - tooltipWidth - TOOLTIP_MARGIN);
  left = Math.max(left, TOOLTIP_MARGIN);

  if (top + tooltipHeight + TOOLTIP_MARGIN > viewportHeight) {
    top = viewportHeight - tooltipHeight - TOOLTIP_MARGIN;
  }
  if (top < TOOLTIP_MARGIN) {
    top = TOOLTIP_MARGIN;
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
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

  const shouldAppend = appendToSelection && hasActiveSelection();
  selectedNodeIds = shouldAppend
    ? new Set([...selectedNodeIds, nodeId])
    : new Set([nodeId]);
  selectedNodeId = nodeId;

  if (updatePermalink) {
    UI.updatePermalink(nodeId);
  }

  UI.enableRadialLayout(true);
  UI.setPathHighlightToggleEnabled(true);
  UI.setPathHighlightToggleState(pathHighlightState);

  const selectionContext = getSelectionContext(selectedNodeIds);
  selectedNodeIds = selectionContext.selectedNodeSet;
  applySelectionHighlight(selectionContext, {
    animateCamera: shouldAppend ? false : animateCamera,
    focusNodeId: nodeId,
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
      900
    );
  } finally {
    Renderer.setAnimationPerformanceMode(false);
    Renderer.updatePositions();
  }
  isAnimating = false;

  handleClick(nodeId, { animateCamera: false });
}

// --- Empty click: reset ---

function handleEmptyClick() {
  selectedNodeId = null;
  selectedNodeIds = new Set();
  hoveredNodeId = null;
  UI.updatePermalink(null);
  tooltip.classList.remove('visible');
  tooltip.setAttribute('aria-hidden', 'true');
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
    UI.hideInfoPanel();
    UI.setPathHighlightToggleEnabled(false);
    UI.enableRadialLayout(false);
    resetView();
    return;
  }

  selectedNodeId = null;
  selectedNodeIds = new Set();
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
      n._currentScale = n._baseScale * 1.14;
    } else {
      colorMap.set(n.id, { ...baseColor, a: SEARCH_NON_MATCH_OPACITY });
      n._currentScale = n._baseScale * 0.82;
    }
    n._hoverRestoreScale = null;
  }

  Renderer.updateColors(colorMap);
  Renderer.updatePositions();

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

function applyAmbientGraphStyle() {
  const colorMap = new Map();
  for (const n of graph.nodes) {
    const baseColor = getNodeBaseColor(n);
    colorMap.set(n.id, { ...baseColor, a: 1 });
    n._currentScale = n._baseScale;
    n._hoverRestoreScale = null;
  }
  Renderer.updateColors(colorMap);
  Renderer.setEdgeOpacity(BASE_EDGE_OPACITY);
  Renderer.clearHighlightEdges();
}

function handlePathHighlightToggleChange(nextState) {
  pathHighlightState.showPrerequisites = nextState.showPrerequisites;
  pathHighlightState.showDependents = nextState.showDependents;
  if (!graph || !hasActiveSelection()) return;

  const selectionContext = getSelectionContext();
  selectedNodeIds = selectionContext.selectedNodeSet;
  if (!selectedNodeId || !selectedNodeIds.has(selectedNodeId)) {
    selectedNodeId = selectedNodeIds.values().next().value ?? null;
  }
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
    const isSelected = selectedNodeSet.has(n.id);
    const isActive = activeNodeSet.has(n.id);
    const baseColor = isActive ? getCategoryColor(n.category) : getNodeBaseColor(n);
    colorMap.set(n.id, {
      ...baseColor,
      a: isActive ? 1 : NON_FOCUS_NODE_OPACITY,
    });

    if (isSelected) {
      n._currentScale = n._baseScale * 1.18;
    } else if (isActive) {
      n._currentScale = n._baseScale * 1.04;
    } else {
      n._currentScale = n._baseScale * 0.82;
    }
    n._hoverRestoreScale = null;
  }

  const edgeGroups = [];
  if (pathHighlightState.showPrerequisites) {
    edgeGroups.push({ nodeSet: prerequisiteSet, colorHex: PREREQUISITES_EDGE_COLOR });
  }
  if (pathHighlightState.showDependents) {
    edgeGroups.push({ nodeSet: dependentSet, colorHex: DEPENDENTS_EDGE_COLOR });
  }

  Renderer.updateColors(colorMap);
  Renderer.updatePositions();
  Renderer.setEdgeOpacity(SELECTED_CONTEXT_EDGE_OPACITY);
  if (edgeGroups.length > 0) {
    Renderer.showHighlightEdgeGroups(edgeGroups);
  } else {
    Renderer.clearHighlightEdges();
  }
  updateSelectionInfoPanel(selectionContext);

  if (animateCamera) {
    const cameraNodeId = selectedNodeSet.has(focusNodeId)
      ? focusNodeId
      : selectedNodeId;
    const node = graph.nodeMap.get(cameraNodeId);
    if (node) Renderer.animateCamera(node.x, node.y, node.z);
  }
}

// --- Layout change ---

async function handleLayoutChange(layout) {
  if (isAnimating || layout === currentLayout) return;
  isAnimating = true;

  const preservedSelectedNodeId = selectedNodeId;
  const shouldPreserveSelection = selectedNodeIds.size > 0;
  const radialCenterNodeId = preservedSelectedNodeId && selectedNodeIds.has(preservedSelectedNodeId)
    ? preservedSelectedNodeId
    : selectedNodeIds.values().next().value ?? null;
  const preservedFilterQuery = document.getElementById('search').value.trim();
  const shouldPreserveFilter = !shouldPreserveSelection && Boolean(preservedFilterQuery);

  if (shouldPreserveSelection) {
    hoveredNodeId = null;
    tooltip.classList.remove('visible');
    tooltip.setAttribute('aria-hidden', 'true');
  } else if (shouldPreserveFilter) {
    hoveredNodeId = null;
    tooltip.classList.remove('visible');
    tooltip.setAttribute('aria-hidden', 'true');
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
      900
    );
  } finally {
    Renderer.setAnimationPerformanceMode(false);
    Renderer.updatePositions();
  }
  isAnimating = false;

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

function getVideoCameraDefaultDuration(actionName) {
  if (actionName === 'orbit' || actionName === 'autoRotate') {
    return VIDEO_DEFAULT_ORBIT_DURATION;
  }
  return VIDEO_DEFAULT_CAMERA_DURATION;
}

function normalizeVideoCameraEasing(rawEasing, actionName, index) {
  if (rawEasing == null) return 'smooth';
  const easing = String(rawEasing).trim().toLowerCase();
  if (!VIDEO_CAMERA_EASING_MODES.has(easing)) {
    throw new Error(
      `Action "${actionName}" at index ${index} has unsupported easing "${rawEasing}".`,
    );
  }
  return easing;
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

function canonicalVideoActionName(actionName) {
  switch (actionName) {
    case 'select':
      return 'selectNode';
    case 'unselect':
      return 'unselectNode';
    case 'focus':
    case 'focusCamera':
      return 'cameraFocus';
    case 'cameraMove':
    case 'move':
      return 'moveCamera';
    case 'rotateCamera':
      return 'autoRotate';
    case 'openNodeTooltip':
      return 'openTooltip';
    case 'closeNodeTooltip':
      return 'closeTooltip';
    default:
      return actionName;
  }
}

function parseVideoScriptInput(scriptInput) {
  if (Array.isArray(scriptInput)) return scriptInput;
  if (typeof scriptInput === 'string') {
    const parsed = JSON.parse(scriptInput);
    if (!Array.isArray(parsed)) {
      throw new Error('Video script string must decode to an array of actions.');
    }
    return parsed;
  }
  throw new Error('Video script must be an array or JSON string.');
}

function actionRequiresNodeId(actionName) {
  return actionName === 'selectNode'
    || actionName === 'focusNode'
    || actionName === 'highlightNeighbors'
    || actionName === 'openTooltip'
    || actionName === 'fadeLabel';
}

function isCameraTimelineAction(actionName) {
  return actionName === 'focusNode'
    || actionName === 'cameraFocus'
    || actionName === 'moveCamera'
    || actionName === 'orbit'
    || actionName === 'autoRotate'
    || actionName === 'zoomTo';
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
  let duration = isCameraAction ? getVideoCameraDefaultDuration(actionName) : 0;
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
    normalized.easing = normalizeVideoCameraEasing(rawAction.easing, declaredActionName, index);
    if (normalized.duration <= 0) {
      throw new Error(
        `Action "${declaredActionName}" at index ${index} requires duration > 0 for smooth camera movement.`,
      );
    }
  }

  if (actionName === 'orbit' || actionName === 'autoRotate') {
    const axis = String(rawAction.axis ?? 'y').toLowerCase();
    if (axis !== 'x' && axis !== 'y' && axis !== 'z') {
      throw new Error(`Action "${declaredActionName}" at index ${index} has invalid axis "${rawAction.axis}".`);
    }
    normalized.axis = axis;
    const defaultSpeed = actionName === 'autoRotate' ? VIDEO_DEFAULT_AUTO_ROTATE_SPEED : 0;
    normalized.speed = toFiniteNumber(rawAction.speed, defaultSpeed);

    const pivot = parseVideoVec3(rawAction.pivot, 'pivot', declaredActionName, index);
    let pivotNodeId = null;
    const pivotNodeRef = rawAction.pivotNodeId ?? rawAction.targetNodeId;
    if (pivotNodeRef != null) {
      if (typeof pivotNodeRef !== 'string' || pivotNodeRef.trim().length === 0) {
        throw new Error(`Action "${declaredActionName}" at index ${index} has invalid pivotNodeId.`);
      }
      pivotNodeId = resolveVideoNodeId(pivotNodeRef);
      if (!pivotNodeId) {
        throw new Error(
          `Action "${declaredActionName}" at index ${index} references unknown pivot node "${pivotNodeRef}".`,
        );
      }
    }
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
      if (typeof focusNodeRef !== 'string' || focusNodeRef.trim().length === 0) {
        throw new Error(`Action "${declaredActionName}" at index ${index} has invalid targetNodeId.`);
      }
      focusNodeId = resolveVideoNodeId(focusNodeRef);
      if (!focusNodeId) {
        throw new Error(
          `Action "${declaredActionName}" at index ${index} references unknown target node "${focusNodeRef}".`,
        );
      }
    }
    if (!focusNodeId && !focusTarget) {
      throw new Error(
        `Action "${declaredActionName}" at index ${index} requires nodeId/targetNodeId or target coordinates.`,
      );
    }

    normalized._cameraFocusNodeId = focusNodeId;
    normalized._cameraFocusTarget = focusTarget;

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

    let targetNodeId = null;
    const targetNodeRef = rawAction.targetNodeId ?? rawAction.lookAtNodeId;
    if (targetNodeRef != null) {
      if (typeof targetNodeRef !== 'string' || targetNodeRef.trim().length === 0) {
        throw new Error(`Action "${declaredActionName}" at index ${index} has invalid targetNodeId.`);
      }
      targetNodeId = resolveVideoNodeId(targetNodeRef);
      if (!targetNodeId) {
        throw new Error(
          `Action "${declaredActionName}" at index ${index} references unknown target node "${targetNodeRef}".`,
        );
      }
    }

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

  if (actionName === 'openTooltip' || actionName === 'fadeLabel') {
    normalized.opacity = clamp01(rawAction.opacity ?? 1);
  }

  if (actionName === 'closeTooltip') {
    normalized.opacity = 0;
  }

  return normalized;
}

function normalizeVideoScript(scriptInput) {
  const script = parseVideoScriptInput(scriptInput);
  const actions = script
    .map((rawAction, index) => normalizeVideoAction(rawAction, index))
    .sort((a, b) => {
      if (a.at !== b.at) return a.at - b.at;
      return a._index - b._index;
    });

  let activeCameraAnimationEnd = -Infinity;
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

  return actions;
}

function computeVideoScriptDuration(actions) {
  return actions.reduce(
    (maxDuration, action) => Math.max(maxDuration, action.at + action.duration),
    0,
  );
}

function createInitialVideoSeekState() {
  const fallbackCameraState = Renderer.getCameraState();
  return {
    visibilityMode: VIDEO_GRAPH_VISIBILITY.REVEALED,
    selectedNodeIds: new Set(),
    focusNodeId: null,
    showPrerequisites: true,
    showDependents: false,
    tooltipNodeId: null,
    tooltipOpacity: 1,
    cameraState: cloneCameraState(videoTimelineState.baseCameraState ?? fallbackCameraState),
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

function applyVideoTooltipFade(state, action, progress) {
  if (action.nodeId) {
    state.tooltipNodeId = action.nodeId;
  }
  const startOpacity = clamp01(state.tooltipOpacity);
  const endOpacity = clamp01(action.opacity ?? 1);
  state.tooltipOpacity = lerpScalar(startOpacity, endOpacity, progress);
  if (progress >= 1 && endOpacity <= VIDEO_TOOLTIP_HIDDEN_OPACITY) {
    state.tooltipNodeId = null;
  }
}

function applyVideoActionAtTime(state, action, timelineTime) {
  const elapsed = Math.max(0, timelineTime - action.at);
  const hasDuration = action.duration > 0;
  const progress = hasDuration ? Math.min(1, elapsed / action.duration) : 1;
  const cameraProgress = isCameraTimelineAction(action.action)
    ? easeVideoProgress(progress, action.easing)
    : progress;
  const effectiveElapsed = hasDuration ? action.duration * cameraProgress : 0;

  switch (action.action) {
    case 'selectNode':
      applyVideoSelectState(state, action);
      break;
    case 'unselectNode':
      if (action.nodeId) {
        state.selectedNodeIds.delete(action.nodeId);
      } else {
        state.selectedNodeIds.clear();
      }
      if (!state.focusNodeId || !state.selectedNodeIds.has(state.focusNodeId)) {
        state.focusNodeId = state.selectedNodeIds.values().next().value ?? null;
      }
      break;
    case 'focusNode':
      applyVideoSelectState(state, action);
      applyVideoFocusCamera(state, action, cameraProgress);
      break;
    case 'cameraFocus':
      applyVideoFocusCamera(state, action, cameraProgress);
      break;
    case 'moveCamera':
      applyVideoMoveCamera(state, action, cameraProgress);
      break;
    case 'highlightNeighbors':
      applyVideoSelectState(state, {
        ...action,
        showPrerequisites: true,
        showDependents: true,
      });
      break;
    case 'hideGraph':
      state.visibilityMode = VIDEO_GRAPH_VISIBILITY.HIDDEN;
      break;
    case 'fadeGraph':
      state.visibilityMode = VIDEO_GRAPH_VISIBILITY.CONTEXT;
      break;
    case 'revealGraph':
      state.visibilityMode = VIDEO_GRAPH_VISIBILITY.REVEALED;
      break;
    case 'openTooltip':
      applyVideoTooltipFade(state, { ...action, opacity: action.opacity ?? 1 }, progress);
      break;
    case 'closeTooltip':
      applyVideoTooltipFade(state, { ...action, opacity: 0 }, progress);
      break;
    case 'fadeLabel':
      applyVideoTooltipFade(state, action, progress);
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
  tooltip.classList.remove('visible');
  tooltip.setAttribute('aria-hidden', 'true');
  tooltip.style.opacity = '';
}

function applyHiddenGraphStyle() {
  const colorMap = new Map();
  for (const n of graph.nodes) {
    const baseColor = getNodeBaseColor(n);
    colorMap.set(n.id, { ...baseColor, a: 0 });
    n._currentScale = n._baseScale;
    n._hoverRestoreScale = null;
  }
  Renderer.updateColors(colorMap);
  Renderer.updatePositions();
  Renderer.setEdgeOpacity(0);
  Renderer.clearHighlightEdges();
}

function applyVideoTooltipState(nodeId, opacity = 1) {
  if (!tooltip || !tooltipLabel || !graph) return;
  const clampedOpacity = clamp01(opacity);
  const node = nodeId ? graph.nodeMap.get(nodeId) : null;

  if (!node || clampedOpacity <= VIDEO_TOOLTIP_HIDDEN_OPACITY) {
    hideTooltipImmediately();
    return;
  }

  const screenPos = Renderer.projectToScreen(node.id);
  if (!screenPos || screenPos.behind) {
    tooltip.classList.remove('visible');
    tooltip.setAttribute('aria-hidden', 'true');
    tooltip.style.opacity = `${clampedOpacity}`;
    return;
  }

  tooltipLabel.textContent = node.label;
  updateHoverTooltipGeometry();
  positionHoverTooltip(screenPos.x, screenPos.y);
  tooltip.classList.add('visible');
  tooltip.setAttribute('aria-hidden', 'false');
  tooltip.style.opacity = `${clampedOpacity}`;
}

function applyVideoSeekStateToScene(state, timelineTime) {
  pathHighlightState.showPrerequisites = state.showPrerequisites;
  pathHighlightState.showDependents = state.showDependents;
  UI.setPathHighlightToggleState(pathHighlightState);

  selectedNodeIds = new Set(state.selectedNodeIds);
  selectedNodeId = selectedNodeIds.has(state.focusNodeId)
    ? state.focusNodeId
    : selectedNodeIds.values().next().value ?? null;
  hoveredNodeId = null;
  if (container) container.style.cursor = 'default';

  if (state.visibilityMode === VIDEO_GRAPH_VISIBILITY.HIDDEN) {
    applyHiddenGraphStyle();
    UI.hideInfoPanel();
    UI.setPathHighlightToggleEnabled(false);
  } else if (state.visibilityMode === VIDEO_GRAPH_VISIBILITY.CONTEXT && selectedNodeIds.size > 0) {
    UI.setPathHighlightToggleEnabled(true);
    const selectionContext = getSelectionContext(selectedNodeIds);
    selectedNodeIds = selectionContext.selectedNodeSet;
    if (!selectedNodeId || !selectedNodeIds.has(selectedNodeId)) {
      selectedNodeId = selectedNodeIds.values().next().value ?? null;
    }
    applySelectionHighlight(selectionContext, {
      animateCamera: false,
      focusNodeId: selectedNodeId,
    });
  } else {
    applyAmbientGraphStyle();
    UI.hideInfoPanel();
    UI.setPathHighlightToggleEnabled(false);
  }

  if (state.cameraState) {
    Renderer.setCameraState(state.cameraState);
  }
  applyVideoTooltipState(state.tooltipNodeId, state.tooltipOpacity);
  Renderer.renderFrame({ updateControls: false });
  videoTimelineState.currentTime = timelineTime;

  return {
    time: timelineTime,
    duration: videoTimelineState.duration,
    selectedNodeIds: [...selectedNodeIds],
    visibilityMode: state.visibilityMode,
  };
}

function enableVideoRenderMode() {
  document.body.classList.add('video-render-mode');
  Renderer.setAutoRotate(false);
  Renderer.setDeterministicMode(true);
  Renderer.setRenderLoopPaused(true);
  hideTooltipImmediately();
}

async function runVideoScript(scriptInput) {
  videoNodeLookupMap = null;
  const actions = normalizeVideoScript(scriptInput);

  videoTimelineState.actions = actions;
  videoTimelineState.duration = computeVideoScriptDuration(actions);
  videoTimelineState.baseCameraState = cloneCameraState(Renderer.getCameraState());
  videoTimelineState.active = true;
  videoTimelineState.currentTime = 0;

  enableVideoRenderMode();
  await seekVideoTimeline(0);

  return {
    duration: videoTimelineState.duration,
    actionCount: videoTimelineState.actions.length,
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

async function captureVideoFrame() {
  if (!videoTimelineState.active) {
    throw new Error('No video script loaded. Call graphVideo.runScript(script) first.');
  }
  return Renderer.captureScreenshot();
}

function installGraphVideoApi(initPromise) {
  window.graphVideo = {
    async runScript(script) {
      await initPromise;
      if (!graph) {
        throw new Error('Graph failed to initialize. Cannot run video script.');
      }
      return runVideoScript(script);
    },
    async seek(t) {
      await initPromise;
      if (!graph) {
        throw new Error('Graph failed to initialize. Cannot seek timeline.');
      }
      return seekVideoTimeline(t);
    },
    async captureFrame() {
      await initPromise;
      if (!graph) {
        throw new Error('Graph failed to initialize. Cannot capture frame.');
      }
      return captureVideoFrame();
    },
    getDuration() {
      return videoTimelineState.duration;
    },
  };
}

// --- Start ---
const initPromise = init();
installGraphVideoApi(initPromise);
