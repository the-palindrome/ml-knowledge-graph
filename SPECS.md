# Knowledge Graph Explorer (ML Concept Graph) — Technical Specification

## 1. Scope

This repository ships a static, browser-based 3D explorer for a directed concept graph focused on machine learning and mathematics.

The current implementation is **not** a generic multi-entity publication graph renderer. It assumes:

- a single concept-node dataset
- directed prerequisite/dependent relationships encoded as adjacency lists
- optional precomputed graph metrics used for analytics, coloring, and sizing
- static hosting with no backend and no build step

Primary goals:

- explore a large concept DAG in 3D
- switch between several layouts
- search concepts by label or category
- inspect recursive prerequisite/dependent context
- read concept definitions and graph metrics
- share deep links and capture screenshots

Out of scope for the shipped app:

- author/post/entity/tag/series node types
- typed edges or per-edge-type filtering
- in-browser graph editing
- server-side persistence or live APIs

---

## 2. Repository Architecture

```text
/ 
├── index.html              # App shell, panels, controls, import map
├── style.css               # Overlay styling, panel layout, responsive rules
├── knowledge_graph.json    # Bundled concept dataset
├── knowledge_graph.layout.json # Optional local cache of initial force-layout positions
├── js/
│   ├── main.js             # App orchestration and interaction state
│   ├── graph.js            # Data loading, derived properties, traversal helpers
│   ├── layouts.js          # Force, hierarchical, cluster, radial layouts
│   ├── renderer.js         # Three.js scene, instanced nodes, edges, camera
│   ├── interaction.js      # Mouse hover/click/double-click handling
│   └── ui.js               # Search, panels, legend, sharing, screenshot, toasts
├── README.md               # Usage and local development notes
└── assets/
    └── mathematics-of-machine-learning-cover.jpg
```

Module responsibilities:

| Module | Responsibility |
| --- | --- |
| `graph.js` | Loads the JSON array, normalizes node fields, filters broken references, computes `depth`, `descendantCount`, node radius, and dynamic category hues, and derives `{ source, target }` edges from `to`. |
| `layouts.js` | Produces static positions for force, hierarchical, cluster, and radial layouts, plus animated transitions between layouts. |
| `renderer.js` | Owns the Three.js scene, camera, controls, node instancing, curved edge rendering, arrowheads, highlight overlays, camera fitting, and screenshot capture. |
| `interaction.js` | Differentiates drag from click, throttles hover, and dispatches single-click, shift-click, double-click, and empty-canvas callbacks. |
| `ui.js` | Wires DOM controls, collapsible and resizable panels, markdown/math rendering, path toggles, legend behavior, sharing, permalink helpers, and toast notifications. |
| `main.js` | Connects the data, renderer, layouts, and UI into the running application state machine. |

---

## 3. Runtime Dependencies

The app is browser-native and uses CDN-hosted dependencies only.

| Concern | Dependency | Source |
| --- | --- | --- |
| 3D rendering | `three@0.160.0` | import map in `index.html` |
| Camera controls | `OrbitControls` | `three/addons/controls/OrbitControls.js` |
| Thick lines | `LineSegments2`, `LineSegmentsGeometry`, `LineMaterial` | `three/addons/lines/*` |
| Force layout | `d3-force-3d@3.0.5` | import map in `index.html` |
| Markdown rendering | `marked@15.0.4` | CDN script tag |
| Math rendering | `KaTeX@0.16.11` + auto-render | CDN script tags |

No `npm install` step is required for local use.

---

## 4. Data Contract

### 4.1 Input Format

`knowledge_graph.json` is a **top-level JSON array**. Each entry is a concept node.

Example shape:

```json
{
  "id": "44592926",
  "label": "element",
  "category": "Combinatorics",
  "definition": "An element of a set ...",
  "long_description": "**Element** ...",
  "to": ["36d3371e", "6fda7451"],
  "from": [],
  "_pagerank": 0.00023954954826623198,
  "_degree_centrality": 0.001201923076923077,
  "_betweenness_centrality": 0,
  "_descendant_ratio": 0.9975915221579962,
  "_prerequisite_ratio": 0,
  "_reachability_ratio": 0.9951946179721288
}
```

### 4.1.1 Optional Initial Layout Cache

`knowledge_graph.layout.json` is an optional JSON file used only during startup to seed the default force layout with cached node positions.

Accepted shapes:

```json
{
  "positions": {
    "44592926": { "x": -156.2, "y": 266.75, "z": -140.87 }
  }
}
```

or a flat object keyed directly by node ID:

```json
{
  "44592926": { "x": -156.2, "y": 266.75, "z": -140.87 }
}
```

Runtime behavior:

1. if the cache file exists and parses successfully, the app applies those positions on initial load
2. if the cache file is missing, malformed, or empty, the app computes the initial force layout in the browser
3. switching to `hierarchical`, `cluster`, or `radial` does not read from this file; those layouts are computed on demand

### 4.2 Supported Node Fields

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Stable node identifier used throughout the app and in permalinks. |
| `label` | string | Human-readable concept name. |
| `category` | string | Topic/category label. May be empty. |
| `definition` | string | Short definition rendered as markdown and LaTeX-aware content. |
| `long_description` | string | Longer markdown/LaTeX-aware content. |
| `to` | string[] | Outgoing directed edges to dependent concepts. |
| `from` | string[] | Incoming directed edges from prerequisite concepts. |
| `_pagerank` | number | Precomputed graph metric. |
| `_degree_centrality` | number | Precomputed graph metric. |
| `_betweenness_centrality` | number | Precomputed graph metric. |
| `_descendant_ratio` | number | Precomputed graph metric. |
| `_prerequisite_ratio` | number | Precomputed graph metric. |
| `_reachability_ratio` | number | Precomputed graph metric. |

There is no `type` field, no publication metadata object, and no typed edge metadata in the shipped format.

### 4.3 Runtime Normalization

When the graph loads:

1. each raw entry is copied into a runtime node object
2. missing optional strings and arrays are defaulted to empty values
3. invalid references in `to` and `from` are filtered out
4. `depth`, `descendantCount`, `radius`, `x`, `y`, `z`, `_baseScale`, and `_currentScale` are added
5. the app builds `nodeMap` and derives a flat `edges` array from `to`

Runtime edge shape:

```js
{ source: "<node-id>", target: "<node-id>" }
```

### 4.4 Derived Properties

Derived values computed on load:

| Property | Definition |
| --- | --- |
| `depth` | Longest incoming path length through `from`, with a cycle guard. |
| `descendantCount` | Size of the full transitive closure through `to`. |
| `radius` | `clamp(2 * log2(descendantCount + 1), 1.5, 6.0)`. |
| `_baseScale` | Initial scale derived from `radius`, later reused for size-mode changes. |
| `_currentScale` | Live render scale after hover/search/selection effects. |

Helper traversals:

- `getUpstream(nodeId, nodeMap)` returns the selected node plus all recursive prerequisites.
- `getDownstream(nodeId, nodeMap)` returns the selected node plus all recursive dependents.

### 4.5 Category Color Mapping

Category colors are generated dynamically at runtime:

- collect unique non-empty categories
- sort alphabetically
- distribute hues evenly around the full 360-degree HSL wheel
- use saturation `0.7` and lightness `0.6`

Fallback for blank or unknown categories:

- hue `180deg`
- saturation `0.3`
- lightness `0.5`

### 4.6 Bundled Dataset Snapshot

The checked-in `knowledge_graph.json`, validated on **March 28, 2026**, contains:

| Property | Value |
| --- | --- |
| Nodes | 2,081 |
| Directed edges | 5,149 |
| Non-empty categories | 27 |
| Uncategorized nodes | 4 |
| Root nodes (`from.length === 0`) | 5 |
| Leaf nodes (`to.length === 0`) | 585 |
| Maximum computed depth | 36 |
| Self-loops | 0 |
| Missing references after validation | 0 |
| Cycle detection result | No cycles detected |

The bundled data is internally consistent, and `from` is the inverse relationship of `to` in the current file.

---

## 5. Runtime State

`main.js` maintains these primary state values:

| State | Default | Meaning |
| --- | --- | --- |
| `currentLayout` | `"force"` | Active layout name. |
| `selectedNodeId` | `null` | Most recently focused node, used for camera focus and sharing. |
| `selectedNodeIds` | empty `Set` | Multi-selection group. |
| `hoveredNodeId` | `null` | Node currently under the pointer. |
| `isAnimating` | `false` | Guards against overlapping layout/radial transitions. |
| `pathHighlightState.showPrerequisites` | `true` | Selection overlay toggle. |
| `pathHighlightState.showDependents` | `false` | Selection overlay toggle. |
| `nodeColorMode` | `"category"` | Category mode or one of six metric keys. |
| `nodeSizeMode` | `"default"` | Default descendant sizing or one of six metric keys. |
| `metricRangeMap` | computed | Min/max per metric key for color and size normalization. |
| `defaultNodeScaleMap` | computed | Cached default node scales for returning from metric-size mode. |

---

## 6. Rendering and Visual System

### 6.1 Scene, Camera, and Controls

The scene is configured as follows:

| Setting | Value |
| --- | --- |
| Scene background | `#040506` |
| Fog | `THREE.FogExp2(0x040506, 0.00023)` |
| Camera | `PerspectiveCamera(60, aspect, 1, 10000)` |
| Initial camera position | `(0, 0, 500)` before graph fitting |
| Controls | `OrbitControls` |
| Damping | enabled, factor `0.08` |
| Distance clamp | `minDistance = 50`, `maxDistance = 5000` |
| Pan | enabled |
| Auto-rotate | disabled by default, speed `0.5` when enabled |

After the first force layout is computed, `fitCameraToGraph()` recenters the camera and targets the graph bounding box.

### 6.2 Lighting

The renderer adds:

- one `AmbientLight` at intensity `0.4`
- one `DirectionalLight` at intensity `0.8` positioned at `(100, 200, 150)`

The main graph uses `MeshBasicMaterial`, so lights do not materially affect node shading. They are effectively decorative in the current implementation.

### 6.3 Node Rendering

Nodes are rendered as a single `THREE.InstancedMesh`:

| Property | Value |
| --- | --- |
| Geometry | `SphereGeometry(1, 12, 9)` |
| Material | `MeshBasicMaterial` with custom per-instance opacity support |
| Draw grouping | One global mesh for all nodes |
| Per-instance color | Set via `setColorAt()` |
| Per-instance opacity | Custom `instanceOpacity` shader attribute |
| Per-instance scale | From node `_currentScale` |

The current app does **not** use typed geometries or separate instanced meshes by node type.

### 6.4 Edge Rendering

Edges are rendered in two layers:

1. a base edge layer for the whole graph
2. zero or more highlight overlay layers for search and selected paths

Base edge layer:

| Property | Value |
| --- | --- |
| Line implementation | `LineSegments2` + `LineSegmentsGeometry` + `LineMaterial` |
| Base color | `#2c3138` |
| Base opacity | `0.32` |
| Width | `1.2` |
| Depth write | disabled |
| Shape | Quadratic curves with 10 segments each |

Directed arrowheads:

| Property | Value |
| --- | --- |
| Geometry | `ConeGeometry(1.2, 3.8, 3)` |
| Material | `MeshBasicMaterial` |
| Color | `#2f353d` |
| Base opacity | `0.38` |

Curvature is deterministic per edge and derived from a hash of the source/target node indices. The app renders arrowheads for both base edges and highlight overlays.

### 6.5 Color and Size Modes

#### Default node color mode

- color by dynamic category hue
- saturation `0.7`
- lightness `0.6`

#### Metric color mode

Metric coloring normalizes one of the six `_...` metrics and maps it to an HSL gradient:

| Endpoint | Hue | Saturation | Lightness |
| --- | --- | --- | --- |
| Low | `218deg` | `0.74` | `0.42` |
| High | `22deg` | `0.92` | `0.66` |

#### Default node size mode

- size is driven by `descendantCount`
- base scale equals computed `radius`

#### Metric size mode

Each node metric is normalized to the current dataset range and remapped into:

- minimum scale = `defaultMin * 0.75`
- maximum scale = `defaultMax * 1.9`

### 6.6 Visual States

| State | Node opacity | Node scale | Edge treatment |
| --- | --- | --- | --- |
| Ambient | `1.0` | `1.0x` base scale | Base edges at `0.32`, no overlays |
| Hover, no active selection | `1.0` | `1.35x` | No hover edge overlay |
| Search match | `1.0` | `1.14x` | Base edges at `0.09`, white overlay among matches |
| Search non-match | `0.18` | `0.82x` | No overlay membership |
| Selected node | `1.0` | `1.18x` | Base edges at `0.06`, path overlay if enabled |
| Active prerequisite/dependent context | `1.0` | `1.04x` | Overlay colors by path direction |
| Inactive during selection | `0.16` | `0.82x` | Only faint base edges remain |

Important implementation detail:

- when a selection is active, **active nodes always render in category colors**
- inactive nodes keep the current color mode
- this means metric coloring is partially overridden by selection state

### 6.7 Tooltip

The hover tooltip is an HTML/SVG overlay:

- content is always `node.label`
- anchored to pointer coordinates, not projected node coordinates
- rendered in a large serif style
- uses an SVG backdrop and connector path
- `pointer-events: none`
- animated with approximately `220ms` to `260ms` CSS transitions

`renderer.js` exposes `projectToScreen()`, but the current UI does not use it.

### 6.8 Performance Mode

During layout and camera animations:

- renderer pixel ratio drops from `min(devicePixelRatio, 1.3)` to `0.8`
- arrowheads are temporarily hidden
- edge geometry is updated less frequently

This is used to keep transitions responsive on large graphs.

---

## 7. Layout Algorithms

### 7.1 Force Layout

This is the default initial layout.

Startup behavior:

- if `knowledge_graph.layout.json` is available, its cached positions are used instead of running the force simulation
- otherwise the browser computes the force layout using the parameters below

Simulation parameters:

| Force | Configuration |
| --- | --- |
| Initial positions | Random within roughly `[-50, 50]` on each axis |
| `forceLink` | distance `30`, strength `0.3` |
| `forceManyBody` | strength `-80`, `theta = 0.8`, `distanceMax = 300` |
| `forceCenter` | enabled |
| `forceX`, `forceY`, `forceZ` | target `0`, strength `0.02` |
| Custom cluster force | groups by `category`, strength `0.15` |
| `alphaDecay` | `0.035` |
| Stop threshold | alpha below `0.018` or tick budget exhausted |

Tick budget formula:

```js
max(120, min(220, round(110 + 2 * sqrt(nodeCount))))
```

For the bundled dataset, this evaluates to `201` ticks.

### 7.2 Hierarchical Layout

Hierarchical layout groups by computed `depth`.

Rules:

- nodes are bucketed by `depth`
- each bucket is sorted by `category`
- tier height is `y = (depth - maxDepth / 2) * 40`
- nodes in the tier are placed on a circle of radius `max(20, group.length * 3)`
- X/Z jitter of about `±3` is added

### 7.3 Cluster Layout

Cluster layout groups by `category || "other"`.

Rules:

- category centroids are placed on a sphere of radius `300` using a golden-spiral distribution
- nodes inside each category are placed on a local sphere of radius `max(20, sqrt(group.length) * 8)`
- there is no second-stage micro force simulation

### 7.4 Radial Layout

Radial layout is centered on a selected node and is enabled only after a selection exists.

Rules:

- breadth-first search runs over both `from` and `to`
- the center node is placed at the origin
- shell radius is `40 * distance` for distances `1` through `5`
- for larger hop counts, shell radius is `200 + 10 * (distance - 5)`
- nodes unreachable from the center are placed randomly on a shell of radius `250`

Because the traversal is effectively undirected, radial layout shows general neighborhood distance rather than a strictly prerequisite-only tree.

### 7.5 Layout Transitions

All layout changes animate over `900ms` using a `smootherStep` easing function.

Layout changes preserve the current state when possible:

- if a selection exists, selection is preserved across layout changes
- otherwise an active search filter is preserved
- otherwise the view is reset before applying the new layout

---

## 8. Interaction Model

### 8.1 Pointer Handling

Interaction is mouse-driven in the current implementation.

| Behavior | Value |
| --- | --- |
| Hover throttle | `33ms` |
| Drag threshold | `5px` |
| Click delay before firing | `250ms` |

The click delay allows double-click to cancel the single-click action.

### 8.2 Hover

Hover behavior:

1. raycast against the node instanced mesh
2. show the tooltip near the pointer
3. set cursor to `pointer`
4. scale the node to `1.35x` only if there is no active selection

Hover does not brighten connected edges.

### 8.3 Search

Search is debounced by `150ms` and only matches:

- `label`
- `category`

Behavior:

- matching nodes remain fully opaque and scale to `1.14x`
- non-matching nodes dim to `0.18` opacity and `0.82x`
- base edges dim to `0.09`
- highlighted search edges appear in white, but only between matching nodes
- if exactly one node matches, the camera target animates to that node
- pressing `Escape` clears the input, resets search, and blurs the field

### 8.4 Selection

Single-click selects a node and enters path-highlighting mode.

Selection behavior:

1. `selectedNodeId` becomes the clicked node
2. `selectedNodeIds` becomes either the single node or the previous set plus the clicked node when `Shift` is held
3. the URL hash is updated to `#node=<id>`
4. radial layout becomes available
5. prerequisite/dependent path toggles become available
6. recursive upstream and downstream sets are recomputed
7. visual state and side panels are refreshed

Selection context is **recursive**, not one-hop:

- prerequisites = full transitive closure through `from`
- dependents = full transitive closure through `to`

Default toggle state:

- prerequisites shown
- dependents hidden

Path highlight overlay colors:

| Overlay | Color |
| --- | --- |
| Prerequisites | `#e8c547` |
| Dependents | `#6290c3` |
| Search overlay | `#f2f3f5` |

### 8.5 Multi-Selection

`Shift+Click` appends to the current selection group.

Group-selection behavior:

- the right-side definition panel switches to a selection summary view
- the analytics panel shows aggregate prerequisite/dependent counts
- direct neighbors listed in the panels exclude nodes already in the group
- graph metrics are shown as `N/A` for group mode

### 8.6 Double-Click

Double-clicking a node:

1. switches the active layout to `radial`
2. animates nodes into radial positions
3. reapplies the standard selection highlight for the clicked node

### 8.7 Empty-Canvas Click

Clicking empty canvas:

- clears selection
- clears hover state
- hides the tooltip
- hides side panels
- resets graph styling to ambient mode
- disables path toggles
- disables radial layout
- clears the permalink hash

### 8.8 Camera Focus

Node focus animates the `OrbitControls.target`, not the camera position.

Effects:

- camera distance and overall orbit offset are preserved
- the selected node becomes the center of attention
- focus animation duration is `600ms`

### 8.9 Deep Links

Permalinks use:

```text
#node=<node-id>
```

Deep-link behavior:

- the app reads the hash once during initial load
- if the node exists, it selects that node after a short delay
- there is no `hashchange` listener after initial boot

---

## 9. UI Surfaces

### 9.1 Top Bar

The fixed top bar contains:

- app title
- search input
- graph stats
- screenshot button
- GitHub repository link
- layout selector
- auto-rotate toggle
- settings-panel toggle

The stats label displays:

```text
<nodeCount> nodes · <edgeCount> edges
```

### 9.2 Left Settings Panel

The settings panel:

- is closed by default
- slides in from the left
- is resizable by pointer drag and left/right arrow keys on the separator
- clamps width to preserve a minimum graph viewport

Contents:

- category legend
- node-coloring selector
- node-sizing selector
- inline help tooltip for coloring behavior

Legend behavior:

- one item per category
- clicking an item writes that category into the search box and triggers search

### 9.3 Right Panels

The right-side shell contains two independent panels:

1. `Definition`
2. `Node properties`

Both panels:

- slide in as a shell from the right
- can be collapsed independently
- can be resized independently

#### Single-node content

Definition panel:

- node label
- clickable category pill
- markdown-rendered definition
- markdown-rendered long description
- personalized book CTA for *Mathematics of Machine Learning*

Node properties panel:

- depth badge
- full recursive prerequisite count
- full recursive dependent count
- six graph metrics
- prerequisite/dependent path toggles
- share controls
- direct prerequisite list
- direct dependent list

#### Group-selection content

When multiple nodes are selected:

- the definition panel label becomes `N selected nodes`
- a `Selection Group` pill is shown
- the definition panel explains shift-click behavior
- the long-description area becomes a preview list of selected node labels
- the book CTA is hidden
- graph metrics are replaced with `N/A`

### 9.4 Sharing and Export

Implemented share actions:

- X / Twitter share URL
- LinkedIn share URL
- copy permalink
- copy embed iframe markup
- download screenshot as `knowledge-graph.png`

The base share URL is:

```text
https://the-palindrome.github.io/ml-knowledge-graph/
```

### 9.5 Auxiliary UI

Additional surfaces:

- a fixed controls hint in the bottom-right corner
- a bottom-center toast notification for copy/export actions
- Open Graph and Twitter card metadata in `index.html`

---

## 10. Markdown, Math, and Content Rendering

Definition and long-description fields are rendered as follows:

1. markdown is parsed with `marked`
2. inline and block math are temporarily stashed before markdown parsing
3. math is restored into the generated HTML
4. KaTeX auto-render processes `$...$` and `$$...$$`

If the libraries are not yet available, the app falls back to plain text rendering.

---

## 11. Deployment and Hosting

Deployment model:

- static files only
- no backend
- no bundler
- compatible with GitHub Pages or any static HTTP server

Local development requires serving the directory over HTTP because the app fetches `./knowledge_graph.json` at runtime.

---

## 12. Known Limitations and Implementation Notes

- The shipped product is concept-only. The previous multi-type Substack/publication model is not implemented in this repository.
- Interaction logic is mouse-specific. There is no custom first-tap hover / second-tap select behavior for touch devices.
- Tooltip placement follows the cursor, not projected node coordinates.
- `ancestorCount` is initialized on nodes but is not currently computed or used.
- `projectToScreen()` exists in the renderer but is unused by the UI layer.
- Search clears in-memory selection state but does not explicitly clear an existing `#node=...` hash.
- If radial layout was previously enabled by a selection, search does not explicitly disable that layout option.
- Lighting has minimal practical effect because node and arrow materials are unlit `MeshBasicMaterial`s.
- Responsive behavior primarily clamps side-panel widths and book-CTA layout. The top bar remains fixed rather than fully reflowing into a mobile-specific navigation pattern.

---

## 13. Source of Truth

This specification describes the repository as implemented on **March 28, 2026**, based on:

- `index.html`
- `style.css`
- `js/main.js`
- `js/graph.js`
- `js/layouts.js`
- `js/renderer.js`
- `js/interaction.js`
- `js/ui.js`
- the checked-in `knowledge_graph.json`

If the code and this document diverge, the code should be treated as the immediate source of truth and this file should be updated.
