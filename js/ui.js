// UI overlay: search, layout selector, info panel, legend, controls hint

let searchTimeout = null;
const DEFAULT_INFO_WIDTH = 400;
const MIN_INFO_WIDTH = 280;
const MAX_INFO_WIDTH = 640;
const DEFAULT_ANALYTICS_WIDTH = 320;
const MIN_ANALYTICS_WIDTH = 220;
const MAX_ANALYTICS_WIDTH = 520;
const DEFAULT_SETTINGS_WIDTH = 320;
const MIN_SETTINGS_WIDTH = 240;
const MAX_SETTINGS_WIDTH = 560;
const RESIZER_WIDTH = 12;
const MIN_GRAPH_VIEWPORT = 260;
const DEFAULT_PREREQS_TITLE = "Direct Prerequisites";
const DEFAULT_DEPS_TITLE = "Direct Dependents";
const GROUP_PREREQS_TITLE = "Direct Prerequisites Outside Selection";
const GROUP_DEPS_TITLE = "Direct Dependents Outside Selection";
const GROUP_NODE_PREVIEW_COUNT = 8;
let infoWidth = DEFAULT_INFO_WIDTH;
let analyticsWidth = DEFAULT_ANALYTICS_WIDTH;
let settingsWidth = DEFAULT_SETTINGS_WIDTH;
let infoCollapsed = false;
let analyticsCollapsed = false;
let settingsPanelOpen = false;
let panelResizeCleanup = null;
let pathHighlightToggleHandler = null;
let suppressPathHighlightToggleEvent = false;

/**
 * Render a markdown string with LaTeX math into an element.
 * Uses marked for markdown and KaTeX auto-render for $...$ and $$...$$ math.
 * Falls back to plain text if libraries haven't loaded yet.
 */
function renderMarkdown(el, text) {
  if (!text) {
    el.innerHTML = "";
    el.style.display = "none";
    return;
  }
  el.style.display = "block";

  if (typeof marked !== "undefined") {
    // Stash math blocks so marked doesn't mangle underscores/asterisks inside them
    const stash = [];
    const stashed = text
      .replace(/\$\$([\s\S]*?)\$\$/g, (_, m) => {
        stash.push(["$$", m]);
        return `\x02MATH${stash.length - 1}\x03`;
      })
      .replace(/\$([^$\n]+?)\$/g, (_, m) => {
        stash.push(["$", m]);
        return `\x02MATH${stash.length - 1}\x03`;
      });

    let html = marked.parse(stashed);

    // Restore math blocks
    html = html.replace(/\x02MATH(\d+)\x03/g, (_, i) => {
      const [delim, math] = stash[+i];
      return `${delim}${math}${delim}`;
    });

    el.innerHTML = html;
  } else {
    el.textContent = text;
    return;
  }

  if (typeof renderMathInElement !== "undefined") {
    renderMathInElement(el, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
      ],
      throwOnError: false,
    });
  }
}

function formatMetricValue(value, { digits = 6, percent = false } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/A";
  if (percent) return `${(value * 100).toFixed(1)}%`;
  const abs = Math.abs(value);
  if (abs > 0 && (abs < 1e-4 || abs >= 1e4)) return value.toExponential(3);
  return value.toFixed(digits).replace(/\.?0+$/, "");
}

function setMetricValue(elementId, value, options) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = formatMetricValue(value, options);
}

function bindSelectChange(elementId, onChange, { notifyInitial = false } = {}) {
  const select = document.getElementById(elementId);
  if (!select) return;

  const emitChange = () => {
    onChange(select.value);
  };

  select.addEventListener("change", emitChange);
  if (notifyInitial) emitChange();
}

function setInfoMetrics({
  pagerank,
  degreeCentrality,
  betweennessCentrality,
  descendantRatio,
  prerequisiteRatio,
  reachabilityRatio,
}) {
  setMetricValue("info-pagerank", pagerank, { digits: 6 });
  setMetricValue("info-degree-centrality", degreeCentrality, { digits: 6 });
  setMetricValue("info-betweenness-centrality", betweennessCentrality, {
    digits: 6,
  });
  setMetricValue("info-descendant-ratio", descendantRatio, { percent: true });
  setMetricValue("info-prerequisite-ratio", prerequisiteRatio, {
    percent: true,
  });
  setMetricValue("info-reachability-ratio", reachabilityRatio, {
    percent: true,
  });
}

function getPathHighlightToggleElements() {
  const prerequisitesToggle = document.getElementById("toggle-prerequisites");
  const dependentsToggle = document.getElementById("toggle-dependents");
  return { prerequisitesToggle, dependentsToggle };
}

function setupPanelResizerPointerDown(
  resizer,
  {
    isDisabled,
    getWidth,
    clampWidth,
    setWidth,
    getDelta,
    onSync,
  },
) {
  if (!resizer) return;

  resizer.addEventListener("pointerdown", (event) => {
    if (isDisabled()) return;

    event.preventDefault();
    cleanupPanelResize();

    const target = event.currentTarget;
    const startX = event.clientX;
    const startWidth = getWidth();
    target.setPointerCapture(event.pointerId);
    document.body.classList.add("resizing-panels");

    const handlePointerMove = (moveEvent) => {
      const delta = getDelta(startX, moveEvent.clientX);
      setWidth(clampWidth(startWidth + delta));
      onSync();
    };

    const handlePointerUp = () => {
      try {
        target.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture can already be gone if the interaction was interrupted.
      }
      document.body.classList.remove("resizing-panels");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      panelResizeCleanup = null;
    };

    panelResizeCleanup = handlePointerUp;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  });
}

export function setupSearch(onSearch) {
  const input = document.getElementById("search");

  input.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => onSearch(input.value.trim()), 150);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      input.value = "";
      onSearch("");
      input.blur();
    }
  });
}

export function setSearchValue(value) {
  document.getElementById("search").value = value;
}

export function setupLayoutSelector(onChange) {
  bindSelectChange("layout-select", onChange);
}

export function setupAutoRotate(onToggle) {
  const btn = document.getElementById("auto-rotate-btn");
  if (!btn) return;
  let enabled = false;
  btn.addEventListener("click", () => {
    enabled = !enabled;
    btn.classList.toggle("active", enabled);
    onToggle(enabled);
  });
}

export function setupNodeColoring(onChange) {
  bindSelectChange("node-coloring-select", onChange, { notifyInitial: true });
}

export function setupNodeSizing(onChange) {
  bindSelectChange("node-sizing-select", onChange, { notifyInitial: true });
}

export function setupExplorerTooltipSize(onChange) {
  bindSelectChange("explorer-tooltip-size-select", onChange, {
    notifyInitial: true,
  });
}

export function setupAnchorTooltipOnSelection(onChange) {
  const checkbox = document.getElementById("anchor-tooltip-on-selection");
  if (!checkbox) return;

  const emitChange = () => {
    onChange(Boolean(checkbox.checked));
  };

  checkbox.addEventListener("change", emitChange);
  emitChange();
}

export function setupShowEdgeDirection(onChange) {
  const checkbox = document.getElementById("show-edge-direction");
  if (!checkbox) return;

  const emitChange = () => {
    onChange(Boolean(checkbox.checked));
  };

  checkbox.addEventListener("change", emitChange);
  emitChange();
}

export function setupSettingsPanel() {
  const settingsButton = document.getElementById("settings-btn");
  const closeButton = document.getElementById("settings-close");
  const settingsResizer = document.getElementById("settings-resizer");

  if (!settingsButton || !closeButton || !settingsResizer) return;

  settingsButton.addEventListener("click", () => {
    settingsPanelOpen = !settingsPanelOpen;
    syncSettingsPanelState();
  });

  closeButton.addEventListener("click", () => {
    settingsPanelOpen = false;
    syncSettingsPanelState();
  });

  setupPanelResizerPointerDown(settingsResizer, {
    isDisabled: () => !settingsPanelOpen,
    getWidth: () => settingsWidth,
    clampWidth: clampSettingsWidth,
    setWidth: (width) => {
      settingsWidth = width;
    },
    getDelta: (startX, currentX) => currentX - startX,
    onSync: syncSettingsPanelState,
  });

  settingsResizer.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      settingsPanelOpen = true;
      settingsWidth = clampSettingsWidth(settingsWidth - 24);
      syncSettingsPanelState();
      event.preventDefault();
    } else if (event.key === "ArrowRight") {
      settingsPanelOpen = true;
      settingsWidth = clampSettingsWidth(settingsWidth + 24);
      syncSettingsPanelState();
      event.preventDefault();
    }
  });

  window.addEventListener("resize", syncSettingsPanelState);
  syncSettingsPanelState();
}

export function setActiveLayout(layout) {
  const select = document.getElementById("layout-select");
  if (!select) return;
  if (select.querySelector(`option[value="${layout}"]`)) {
    select.value = layout;
  }
}

export function enableRadialLayout(enable) {
  const option = document.querySelector(
    '#layout-select option[value="radial"]',
  );
  if (option) option.disabled = !enable;
}

export function showInfoPanel(
  node,
  upstreamCount,
  downstreamCount,
  directPrereqs,
  directDeps,
  primaryColorHex,
  getCategoryColorHex,
  onNodeClick,
  onCategoryClick,
) {
  const sidePanels = document.getElementById("side-panels");

  setDependencySectionTitles();
  setBookCtaVisible(true);

  const labelEl = document.getElementById("info-label");
  labelEl.textContent = node.label;
  labelEl.style.color = primaryColorHex;

  // Category pill
  const catEl = document.getElementById("info-category");
  catEl.innerHTML = "";
  if (node.category) {
    const pill = document.createElement("span");
    pill.className = "category-pill";
    pill.textContent = node.category;
    pill.style.backgroundColor = getCategoryColorHex(node.category);
    pill.addEventListener("click", () => onCategoryClick(node.category));
    catEl.appendChild(pill);
  }

  // Definition
  renderMarkdown(document.getElementById("info-definition"), node.definition);

  // Long description
  renderMarkdown(
    document.getElementById("info-long-description"),
    node.long_description,
  );

  const bookCta = document.getElementById("book-cta");
  const bookCtaCopy = document.getElementById("book-cta-copy");
  const bookCtaLink = document.getElementById("book-cta-link");
  bookCta.style.setProperty("--book-cta-accent", primaryColorHex);
  bookCtaCopy.textContent = node.label
    ? `If ${node.label} sparked your curiosity, Mathematics of Machine Learning gives you a structured path through the linear algebra, calculus, probability, and machine learning foundations behind it.`
    : "Mathematics of Machine Learning gives you a structured path through the linear algebra, calculus, probability, and machine learning foundations behind this graph.";
  bookCtaLink.setAttribute(
    "aria-label",
    node.label
      ? `View Mathematics of Machine Learning on Amazon after exploring ${node.label}`
      : "View Mathematics of Machine Learning on Amazon",
  );

  document.getElementById("info-depth").textContent = `Depth ${node.depth}`;
  document.getElementById("info-upstream").textContent =
    `${upstreamCount} prerequisite${upstreamCount !== 1 ? "s" : ""} in full chain`;
  document.getElementById("info-downstream").textContent =
    `${downstreamCount} concept${downstreamCount !== 1 ? "s" : ""} depend${downstreamCount === 1 ? "s" : ""} on this`;
  setInfoMetrics({
    pagerank: node._pagerank,
    degreeCentrality: node._degree_centrality,
    betweennessCentrality: node._betweenness_centrality,
    descendantRatio: node._descendant_ratio,
    prerequisiteRatio: node._prerequisite_ratio,
    reachabilityRatio: node._reachability_ratio,
  });

  fillNodeList(
    "info-prereqs",
    directPrereqs,
    onNodeClick,
    "None (root concept)",
  );
  fillNodeList("info-deps", directDeps, onNodeClick, "None (leaf concept)");

  sidePanels.classList.add("visible");
  syncAnalyticsPanelState();
}

export function showSelectionGroupPanel({
  selectedNodes,
  prerequisiteCount,
  dependentCount,
  directPrereqs,
  directDeps,
  onNodeClick,
}) {
  const sidePanels = document.getElementById("side-panels");
  const selectedCount = selectedNodes.length;
  const labelEl = document.getElementById("info-label");
  labelEl.textContent = `${selectedCount} selected node${selectedCount !== 1 ? "s" : ""}`;
  labelEl.style.color = "#d6e1ff";

  setDependencySectionTitles(GROUP_PREREQS_TITLE, GROUP_DEPS_TITLE);
  setBookCtaVisible(false);

  const catEl = document.getElementById("info-category");
  catEl.innerHTML = "";
  const groupPill = document.createElement("span");
  groupPill.className = "category-pill";
  groupPill.textContent = "Selection Group";
  groupPill.style.backgroundColor = "#3d4f69";
  groupPill.style.cursor = "default";
  catEl.appendChild(groupPill);

  renderMarkdown(
    document.getElementById("info-definition"),
    `Shift-click toggles nodes in this group. Click without Shift to start a new selection.`,
  );
  renderMarkdown(
    document.getElementById("info-long-description"),
    formatSelectionNodePreview(selectedNodes),
  );

  document.getElementById("info-depth").textContent =
    `${selectedCount} selected node${selectedCount !== 1 ? "s" : ""}`;
  document.getElementById("info-upstream").textContent =
    `${prerequisiteCount} prerequisite${prerequisiteCount !== 1 ? "s" : ""} connect to this selection`;
  document.getElementById("info-downstream").textContent =
    `${dependentCount} concept${dependentCount !== 1 ? "s" : ""} depend${dependentCount === 1 ? "s" : ""} on this selection`;

  setInfoMetrics({
    pagerank: null,
    degreeCentrality: null,
    betweennessCentrality: null,
    descendantRatio: null,
    prerequisiteRatio: null,
    reachabilityRatio: null,
  });

  fillNodeList(
    "info-prereqs",
    directPrereqs,
    onNodeClick,
    "None outside current selection",
  );
  fillNodeList(
    "info-deps",
    directDeps,
    onNodeClick,
    "None outside current selection",
  );

  sidePanels.classList.add("visible");
  syncAnalyticsPanelState();
}

function setBookCtaVisible(isVisible) {
  const bookCta = document.getElementById("book-cta");
  if (!bookCta) return;
  bookCta.hidden = !isVisible;
}

function setDependencySectionTitles(
  prereqTitle = DEFAULT_PREREQS_TITLE,
  depsTitle = DEFAULT_DEPS_TITLE,
) {
  const prereqsTitleEl = document.getElementById("info-prereqs-title");
  const depsTitleEl = document.getElementById("info-deps-title");
  if (prereqsTitleEl) prereqsTitleEl.textContent = prereqTitle;
  if (depsTitleEl) depsTitleEl.textContent = depsTitle;
}

function formatSelectionNodePreview(selectedNodes) {
  if (!selectedNodes || selectedNodes.length === 0) return "";

  const previewNodes = selectedNodes.slice(0, GROUP_NODE_PREVIEW_COUNT);
  const lines = previewNodes.map((node) => `- ${node.label}`);
  const hiddenCount = selectedNodes.length - previewNodes.length;
  if (hiddenCount > 0) {
    lines.push(`- ...and ${hiddenCount} more`);
  }

  return `Grouped nodes:\n\n${lines.join("\n")}`;
}

function fillNodeList(elementId, items, onNodeClick, emptyText) {
  const el = document.getElementById(elementId);
  el.innerHTML = "";
  if (!Array.isArray(items) || items.length === 0) {
    const span = document.createElement("span");
    span.style.cssText = "color:#666;font-size:13px";
    span.textContent = emptyText;
    el.appendChild(span);
    return;
  }
  for (const item of items) {
    const link = document.createElement("div");
    link.className = "node-link";
    link.textContent = item.label;
    link.addEventListener("click", () => onNodeClick(item.id));
    el.appendChild(link);
  }
}

export function hideInfoPanel() {
  cleanupPanelResize();
  document.getElementById("side-panels").classList.remove("visible");
  syncSettingsPanelState();
}

export function setupInfoPanels() {
  const infoResizer = document.getElementById("info-resizer");
  const infoToggle = document.getElementById("info-toggle");
  const toggle = document.getElementById("analytics-toggle");
  const analyticsResizer = document.getElementById("analytics-resizer");

  setupPanelResizerPointerDown(infoResizer, {
    isDisabled: () => infoCollapsed,
    getWidth: () => infoWidth,
    clampWidth: clampInfoWidth,
    setWidth: (width) => {
      infoWidth = width;
    },
    getDelta: (startX, currentX) => startX - currentX,
    onSync: syncAnalyticsPanelState,
  });

  infoToggle.addEventListener("click", () => {
    infoCollapsed = !infoCollapsed;
    syncAnalyticsPanelState();
  });

  toggle.addEventListener("click", () => {
    analyticsCollapsed = !analyticsCollapsed;
    syncAnalyticsPanelState();
  });

  setupPanelResizerPointerDown(analyticsResizer, {
    isDisabled: () => analyticsCollapsed,
    getWidth: () => analyticsWidth,
    clampWidth: clampAnalyticsWidth,
    setWidth: (width) => {
      analyticsWidth = width;
    },
    getDelta: (startX, currentX) => startX - currentX,
    onSync: syncAnalyticsPanelState,
  });

  infoResizer.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      infoWidth = clampInfoWidth(infoWidth + 24);
      syncAnalyticsPanelState();
      event.preventDefault();
    } else if (event.key === "ArrowRight") {
      infoWidth = clampInfoWidth(infoWidth - 24);
      syncAnalyticsPanelState();
      event.preventDefault();
    }
  });

  analyticsResizer.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      analyticsCollapsed = false;
      analyticsWidth = clampAnalyticsWidth(analyticsWidth + 24);
      syncAnalyticsPanelState();
      event.preventDefault();
    } else if (event.key === "ArrowRight") {
      analyticsCollapsed = false;
      analyticsWidth = clampAnalyticsWidth(analyticsWidth - 24);
      syncAnalyticsPanelState();
      event.preventDefault();
    }
  });

  window.addEventListener("resize", syncAnalyticsPanelState);
  syncAnalyticsPanelState();
}

export function setupPathHighlightToggles(onChange) {
  const { prerequisitesToggle, dependentsToggle } =
    getPathHighlightToggleElements();
  if (!prerequisitesToggle || !dependentsToggle) return;

  if (pathHighlightToggleHandler) {
    prerequisitesToggle.removeEventListener("change", pathHighlightToggleHandler);
    dependentsToggle.removeEventListener("change", pathHighlightToggleHandler);
  }

  pathHighlightToggleHandler = () => {
    if (suppressPathHighlightToggleEvent) return;
    onChange({
      showPrerequisites: prerequisitesToggle.checked,
      showDependents: dependentsToggle.checked,
    });
  };

  prerequisitesToggle.addEventListener("change", pathHighlightToggleHandler);
  dependentsToggle.addEventListener("change", pathHighlightToggleHandler);
}

export function setPathHighlightToggleState(state) {
  const { prerequisitesToggle, dependentsToggle } =
    getPathHighlightToggleElements();
  if (!prerequisitesToggle || !dependentsToggle || !state) return;

  suppressPathHighlightToggleEvent = true;
  prerequisitesToggle.checked = Boolean(state.showPrerequisites);
  dependentsToggle.checked = Boolean(state.showDependents);
  suppressPathHighlightToggleEvent = false;
}

export function setPathHighlightToggleEnabled(enabled) {
  const controls = document.getElementById("path-highlight-controls");
  const { prerequisitesToggle, dependentsToggle } =
    getPathHighlightToggleElements();
  if (!controls || !prerequisitesToggle || !dependentsToggle) return;

  const isDisabled = !enabled;
  controls.classList.toggle("is-disabled", isDisabled);
  prerequisitesToggle.disabled = isDisabled;
  dependentsToggle.disabled = isDisabled;
}

function clampPanelWidth(width, minWidth, maxWidth) {
  const safeMaxWidth = Math.max(maxWidth, Math.min(minWidth, maxWidth));
  const safeMinWidth = Math.min(minWidth, safeMaxWidth);
  return Math.max(safeMinWidth, Math.min(safeMaxWidth, width));
}

function getPanelCollapsedWidth(propertyName) {
  const sidePanels = document.getElementById("side-panels");
  if (!sidePanels) return 56;

  const value = parseFloat(
    getComputedStyle(sidePanels)
      .getPropertyValue(propertyName)
      .trim(),
  );
  return Number.isFinite(value) ? value : 56;
}

function getAnalyticsCollapsedWidth() {
  return getPanelCollapsedWidth("--analytics-panel-collapsed-width");
}

function getInfoCollapsedWidth() {
  return getPanelCollapsedWidth("--info-panel-collapsed-width");
}

function getInfoResizerWidth() {
  return infoCollapsed ? 0 : RESIZER_WIDTH;
}

function getAnalyticsResizerWidth() {
  return analyticsCollapsed ? 0 : RESIZER_WIDTH;
}

function getSettingsResizerWidth() {
  return settingsPanelOpen ? RESIZER_WIDTH : 0;
}

function getVisibleRightPanelWidth() {
  const sidePanels = document.getElementById("side-panels");
  if (!sidePanels || !sidePanels.classList.contains("visible")) return 0;

  const infoVisibleWidth = infoCollapsed ? getInfoCollapsedWidth() : infoWidth;
  const analyticsVisibleWidth = analyticsCollapsed
    ? getAnalyticsCollapsedWidth()
    : analyticsWidth;
  return (
    infoVisibleWidth
    + analyticsVisibleWidth
    + getInfoResizerWidth()
    + getAnalyticsResizerWidth()
  );
}

function getInfoMaxWidth(analyticsVisibleWidth) {
  return Math.min(
    MAX_INFO_WIDTH,
    window.innerWidth
      - MIN_GRAPH_VIEWPORT
      - getCurrentSettingsWidth()
      - getSettingsResizerWidth()
      - getInfoResizerWidth()
      - getAnalyticsResizerWidth()
      - analyticsVisibleWidth,
  );
}

function getAnalyticsMaxWidth(infoVisibleWidth) {
  return Math.min(
    MAX_ANALYTICS_WIDTH,
    window.innerWidth
      - MIN_GRAPH_VIEWPORT
      - getCurrentSettingsWidth()
      - getSettingsResizerWidth()
      - getInfoResizerWidth()
      - getAnalyticsResizerWidth()
      - infoVisibleWidth,
  );
}

function getSettingsMaxWidth(rightPanelsVisibleWidth = getVisibleRightPanelWidth()) {
  return Math.min(
    MAX_SETTINGS_WIDTH,
    window.innerWidth
      - MIN_GRAPH_VIEWPORT
      - getSettingsResizerWidth()
      - rightPanelsVisibleWidth,
  );
}

function clampInfoWidth(width, analyticsVisibleWidth = getCurrentAnalyticsWidth()) {
  return clampPanelWidth(width, MIN_INFO_WIDTH, getInfoMaxWidth(analyticsVisibleWidth));
}

function clampAnalyticsWidth(width, infoVisibleWidth = infoWidth) {
  return clampPanelWidth(width, MIN_ANALYTICS_WIDTH, getAnalyticsMaxWidth(infoVisibleWidth));
}

function clampSettingsWidth(width, rightPanelsVisibleWidth = getVisibleRightPanelWidth()) {
  return clampPanelWidth(width, MIN_SETTINGS_WIDTH, getSettingsMaxWidth(rightPanelsVisibleWidth));
}

function getCurrentAnalyticsWidth() {
  return analyticsCollapsed
    ? getAnalyticsCollapsedWidth()
    : clampAnalyticsWidth(analyticsWidth, infoWidth);
}

function getCurrentSettingsWidth() {
  return settingsPanelOpen ? settingsWidth : 0;
}

function syncSettingsPanelState() {
  const shell = document.getElementById("settings-shell");
  const settingsButton = document.getElementById("settings-btn");
  const closeButton = document.getElementById("settings-close");
  if (!shell || !settingsButton || !closeButton) return;

  const rightPanelsVisibleWidth = getVisibleRightPanelWidth();
  const effectiveSettingsWidth = clampSettingsWidth(
    settingsWidth,
    rightPanelsVisibleWidth,
  );
  settingsWidth = effectiveSettingsWidth;

  shell.style.setProperty("--settings-panel-width", `${effectiveSettingsWidth}px`);
  shell.classList.toggle("open", settingsPanelOpen);
  shell.setAttribute("aria-hidden", String(!settingsPanelOpen));
  settingsButton.classList.toggle("active", settingsPanelOpen);
  settingsButton.setAttribute("aria-expanded", String(settingsPanelOpen));
  settingsButton.setAttribute(
    "title",
    settingsPanelOpen ? "Hide settings panel" : "Show settings panel",
  );
  closeButton.setAttribute("aria-expanded", String(settingsPanelOpen));
  closeButton.setAttribute(
    "title",
    settingsPanelOpen ? "Hide settings panel" : "Show settings panel",
  );
}

function syncAnalyticsPanelState() {
  const sidePanels = document.getElementById("side-panels");
  const infoToggle = document.getElementById("info-toggle");
  const toggle = document.getElementById("analytics-toggle");
  const infoBody = document.getElementById("info-panel-body");
  const infoCollapsedLabel = document.querySelector(".info-panel-collapsed-label");
  const body = document.getElementById("analytics-panel-body");
  const collapsedLabel = document.querySelector(
    ".analytics-panel-collapsed-label",
  );
  if (
    !sidePanels || !infoToggle || !toggle || !infoBody || !infoCollapsedLabel
    || !body || !collapsedLabel
  ) return;

  let effectiveAnalyticsWidth = analyticsCollapsed
    ? getAnalyticsCollapsedWidth()
    : clampAnalyticsWidth(analyticsWidth, infoWidth);
  const effectiveInfoWidth = infoCollapsed
    ? getInfoCollapsedWidth()
    : clampInfoWidth(infoWidth, effectiveAnalyticsWidth);
  infoWidth = infoCollapsed ? infoWidth : effectiveInfoWidth;
  effectiveAnalyticsWidth = analyticsCollapsed
    ? getAnalyticsCollapsedWidth()
    : clampAnalyticsWidth(analyticsWidth, effectiveInfoWidth);
  analyticsWidth = analyticsCollapsed ? analyticsWidth : effectiveAnalyticsWidth;

  sidePanels.style.setProperty(
    "--info-panel-width",
    `${effectiveInfoWidth}px`,
  );
  sidePanels.style.setProperty(
    "--analytics-panel-width",
    `${effectiveAnalyticsWidth}px`,
  );
  sidePanels.classList.toggle("info-collapsed", infoCollapsed);
  sidePanels.classList.toggle("analytics-collapsed", analyticsCollapsed);
  infoToggle.setAttribute("aria-expanded", String(!infoCollapsed));
  infoToggle.setAttribute(
    "title",
    infoCollapsed
      ? "Expand node definition panel"
      : "Collapse node definition panel",
  );
  toggle.setAttribute("aria-expanded", String(!analyticsCollapsed));
  toggle.setAttribute(
    "title",
    analyticsCollapsed
      ? "Expand node properties panel"
      : "Collapse node properties panel",
  );
  infoBody.hidden = infoCollapsed;
  infoCollapsedLabel.hidden = !infoCollapsed;
  body.hidden = analyticsCollapsed;
  collapsedLabel.hidden = !analyticsCollapsed;
  syncSettingsPanelState();
}

function cleanupPanelResize() {
  if (panelResizeCleanup) {
    panelResizeCleanup();
  }
}

export function setupLegend(categories, getColorHex, onCategoryClick) {
  const legend = document.getElementById("legend");
  legend.innerHTML = "";

  for (const cat of categories) {
    const item = document.createElement("div");
    item.className = "legend-item";

    const dot = document.createElement("div");
    dot.className = "legend-dot";
    dot.style.backgroundColor = getColorHex(cat);

    const label = document.createElement("span");
    label.className = "legend-label";
    label.textContent = cat;

    item.appendChild(dot);
    item.appendChild(label);
    item.addEventListener("click", () => onCategoryClick(cat));
    legend.appendChild(item);
  }
}

export function setupControlsHint() {
  // hint is always visible; no fade behaviour
}

export function updateStats(nodeCount, edgeCount) {
  document.getElementById("stats").textContent =
    `${nodeCount} nodes \u00b7 ${edgeCount} edges`;
}

// --- Share features ---

let toastTimer = null;

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2500);
}

function getPermalink(nodeId) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  if (nodeId) {
    url.hash = `node=${encodeURIComponent(nodeId)}`;
  }
  return url.toString();
}

export function updatePermalink(nodeId) {
  const url = new URL(window.location.href);
  url.hash = nodeId ? `node=${encodeURIComponent(nodeId)}` : "";
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export function getNodeIdFromHash() {
  const hash = window.location.hash;
  const match = hash.match(/^#node=(.+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function setupShareButtons(getCurrentNodeId, getCurrentNodeLabel) {
  const getCurrentPermalink = () => getPermalink(getCurrentNodeId());

  document.getElementById("share-x").addEventListener("click", () => {
    const label = getCurrentNodeLabel();
    const url = getCurrentPermalink();
    const text = label
      ? `Exploring "${label}" in the ML Knowledge Graph — see how concepts connect:`
      : "Explore 2,000+ ML & math concepts in this interactive 3D knowledge graph:";
    window.open(
      `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      "_blank",
      "width=550,height=420",
    );
  });

  document.getElementById("share-linkedin").addEventListener("click", () => {
    const url = getCurrentPermalink();
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
      "_blank",
      "width=550,height=500",
    );
  });

  document.getElementById("share-copy").addEventListener("click", () => {
    const url = getCurrentPermalink();
    navigator.clipboard
      .writeText(url)
      .then(() => {
        showToast("Link copied to clipboard");
      })
      .catch(() => {
        // Fallback
        showToast(url);
      });
  });

  document.getElementById("share-embed").addEventListener("click", () => {
    const url = getCurrentPermalink();
    const embedCode = `<iframe src="${url}" width="800" height="600" frameborder="0" allow="fullscreen" style="border-radius:8px;border:1px solid #333"></iframe>`;
    navigator.clipboard
      .writeText(embedCode)
      .then(() => {
        showToast("Embed code copied to clipboard");
      })
      .catch(() => {
        showToast("Could not copy — check clipboard permissions");
      });
  });
}

export function setupScreenshotButton(onCapture) {
  document.getElementById("screenshot-btn").addEventListener("click", () => {
    const dataUrl = onCapture();
    const link = document.createElement("a");
    link.download = "knowledge-graph.png";
    link.href = dataUrl;
    link.click();
    showToast("Screenshot saved");
  });
}
