# Video Renderer Documentation

This document covers the graph video rendering system end-to-end:

- Browser-side timeline API (`window.graphVideo`)
- Timeline script format
- Every supported action and its arguments
- Node action resolution rules
- Node CLI renderer (`scripts/render-graph-video.mjs`)
- Runtime behavior and validation rules

## 1. Architecture

The renderer has two parts:

1. In-page timeline engine (`js/main.js`), exposed via `window.graphVideo`
2. Node CLI driver (`scripts/render-graph-video.mjs`) that:
   - launches Puppeteer
   - opens the graph page
   - injects and runs the timeline script
   - seeks frame-by-frame
   - captures PNGs
   - stitches video with `ffmpeg`

During scripted rendering, the page enters `video-render-mode`:

- Top bar, settings shell, side panels, controls hint, and toast are hidden
- Tooltip transitions are disabled for deterministic frames
- Camera updates run in deterministic mode

## 2. Browser API (`window.graphVideo`)

## Methods

### `await window.graphVideo.runScript(script)`

Loads and validates a timeline script, switches to deterministic render mode, and seeks to `t=0`.

- `script`: either
  - a legacy array of action objects
  - an object with `{ script, cameraStart?, cameraEnd? }`
  - a JSON string encoding either:
    - a legacy array of action objects
    - an object with `{ script, cameraStart?, cameraEnd? }`

Returns:

```json
{
  "duration": 13.3,
  "actionCount": 10,
  "cameraStart": { "position": { "x": 0, "y": 0, "z": 500 }, "target": { "x": 0, "y": 0, "z": 0 } },
  "cameraEnd": { "position": { "x": 40, "y": 20, "z": 700 }, "target": { "x": 0, "y": 0, "z": 0 } }
}
```

### `await window.graphVideo.seek(t)`

Seeks the timeline to exact time `t` (seconds), recomputes the full state deterministically, and renders one frame.

- `t`: number (seconds), clamped to `[0, duration]`

Returns:

```json
{
  "time": 4.5,
  "duration": 13.3,
  "selectedNodeIds": ["..."],
  "visibilityMode": "context"
}
```

### `await window.graphVideo.captureFrame()`

Captures current frame and returns a PNG data URL.

Return format:

```text
data:image/png;base64,...
```

### `window.graphVideo.getDuration()`

Returns numeric timeline duration in seconds.

## 3. Timeline Script Format

A timeline script payload is an object:

```json
{
  "cameraStart": {
    "position": { "x": 0, "y": 0, "z": 500 },
    "target": { "x": 0, "y": 0, "z": 0 }
  },
  "cameraEnd": {
    "position": { "x": 40, "y": 20, "z": 700 },
    "target": { "x": 0, "y": 0, "z": 0 }
  },
  "script": [
    { "at": 0.0, "action": "focusNode", "nodeId": "gradient-descent" },
    { "at": 1.0, "action": "autoRotate", "axis": "y", "speed": 0.25, "duration": 4.0 }
  ]
}
```

- `script` is required and contains the action-array format used previously.
- `cameraStart` is optional; if omitted, the current/default camera state is used.
- `cameraEnd` is optional and informative only. Rendering ignores it and does not move the camera to it automatically.

## Common fields

- `at` (number): action start time in seconds
  - negative values are clamped to `0`
- `action` (string): action name (canonical or alias)
- `duration` (number):
  - non-camera actions default to `0`, unless an action explicitly requires `duration`
  - camera actions default to smooth non-zero durations
  - camera actions require `duration > 0`

## Camera overlap rule

Camera actions may **not overlap in time**. If a camera action starts before the previous camera action ends, validation fails.

Camera actions are:

- `focusNode`
- `cameraFocus`
- `moveCamera`
- `orbit`
- `autoRotate`
- `zoomTo`

## Layout overlap rule

`changeLayout` actions may **not overlap in time**. If a layout action starts before the previous layout action ends, validation fails.

## 4. Node Reference Resolution

Whenever an action uses a node identifier field (`nodeId`, `targetNodeId`, etc.), values are resolved in this order:

1. exact internal node ID
2. case-insensitive full label
3. slugified label (e.g. `gradient-descent`)

If resolution fails, the script is rejected.

## 5. Vector (`vec3`) Argument Format

Fields that expect vectors accept either:

- object: `{ "x": 0, "y": 10, "z": 200 }`
- array: `[0, 10, 200]`

All components must be finite numbers.

## 6. Easing

Camera actions support `easing`:

- `smooth` (default)
- `linear`
- `ease-in`
- `ease-out`
- `ease-in-out`

If omitted, easing defaults to `smooth`.

## 7. Actions Reference

This section lists **all canonical actions** and all accepted alias names.

## 7.1 Selection and Context

### `selectNode`
Selects a node and applies contextual fade/highlighting.

Required:

- `nodeId` (string)

Optional:

- `appendToSelection` (boolean): append instead of replacing selection
- `append` (boolean): alias of `appendToSelection`
- `showPrerequisites` (boolean)
- `highlightPrerequisites` (boolean): alias of `showPrerequisites`
- `showDependents` (boolean)
- `highlightDependents` (boolean): alias of `showDependents`
- `level` (non-negative integer): depth limit used when prerequisite/dependent highlighting is enabled
- `nonFocusOpacity` (number in `[0,1]`, default `0.16`)
- `duration` (default `0`): contextual highlight transition duration
- `at`

Aliases:

- `select` -> `selectNode`

### `unselectNode`
Removes a selected node, or clears all selection.

Optional:

- `nodeId` (string): if set, remove only this node from selection
- without `nodeId`: clear all selections
- `duration` (default `0`): contextual-to-ambient/context transition duration
- `at`

Aliases:

- `unselect` -> `unselectNode`

### `focusNode`
Selection + camera focus in one action.

Required:

- `nodeId` (string)

Optional:

- all selection options from `selectNode`
- `duration` (default `1.2`): applies to both camera movement and node/edge highlight transitions
- `easing` (default `smooth`)
- `distance` (number > 0): optional camera distance from focused target

## 7.2 Camera-Only Actions

### `cameraFocus`
Moves camera focus smoothly without changing selection.

Required (at least one targeting mode):

- `nodeId` (string), or
- `targetNodeId` (string), or
- `focusNodeId` (string), or
- `target` / `lookAt` / `point` (vec3)

Optional:

- `distance` (number > 0)
- `duration` (default `1.2`)
- `windUp` (number in seconds, default `0.2 * duration`)
- `windDown` (number in seconds, default `0.2 * duration`)
- `easing` (default `smooth`)
- `at`

Aliases:

- `focus` -> `cameraFocus`
- `focusCamera` -> `cameraFocus`

### `moveCamera`
Moves camera position/target using absolute coordinates and/or deltas.

Must provide at least one of the following:

- `position` / `to` / `cameraPosition` (vec3)
- `delta` / `offset` / `moveBy` (vec3)
- `target` / `lookAt` / `cameraTarget` (vec3)
- `targetDelta` / `lookAtDelta` (vec3)
- `targetNodeId` / `lookAtNodeId` (string)

Optional:

- `duration` (default `1.2`)
- `easing` (default `smooth`)
- `at`

Aliases:

- `move` -> `moveCamera`
- `cameraMove` -> `moveCamera`

### `orbit`
Rotates camera around current target (or optional pivot).

Optional:

- `axis` (`"x" | "y" | "z"`, default `"y"`)
- `speed` (number, turns-per-second equivalent in script semantics)
  - default for `orbit`: `0` (set this explicitly to rotate)
- `pivot` (vec3)
- `pivotNodeId` (string)
- `targetNodeId` (string): accepted as pivot node alias
- `duration` (default `4.0`)
- `easing` (default `smooth`)
- `at`

### `autoRotate`
Like `orbit`, but with a non-zero default rotation speed.
Rotation speed can include an optional smooth wind-up at the beginning and wind-down near the end.

Optional:

- `axis` (`"x" | "y" | "z"`, default `"y"`)
- `speed` (number, default `0.2`)
- `windUp` (number in seconds, default `0`)
  - set `0` for no wind-up
- `windDown` (number in seconds, default `0`)
  - set `0` for no wind-down
- `pivot` (vec3)
- `pivotNodeId` (string)
- `targetNodeId` (string): accepted as pivot node alias
- `duration` (default `4.0`)
- `easing` (default `smooth`)
- `at`

Aliases:

- `rotateCamera` -> `autoRotate`

### `zoomTo`
Moves camera position along current view direction to a target distance.

Required:

- `distance` (number > 0)

Optional:

- `duration` (default `1.2`)
- `easing` (default `smooth`)
- `at`

### `changeLayout`
Transitions node positions to a named graph layout.

Required:

- `layout` (`"force" | "hierarchical" | "cluster" | "radial"`)
- `duration` (number >= `0`): transition length in seconds

Optional:

- `easing` (default `smooth`)
- `at`
- `centerNodeId` (string): required when `layout` is `"radial"`
- `nodeId` / `focusNodeId` / `targetNodeId` (string): accepted aliases for `centerNodeId`

Notes:

- `duration: 0` applies the layout immediately.
- Layout target positions are computed once when the script is loaded, then reused deterministically during seeking/rendering.

## 7.3 Graph Visibility Actions

### `hideGraph`
Sets node and edge opacity to zero.

Optional:

- `duration` (default `0`): continuous fade-to-hidden duration
- `at`

### `fadeGraph`
Applies context mode visual treatment (selected + prerequisite/dependent emphasis if any selection exists).

Optional:

- `at`, `duration`

### `revealGraph`
Restores ambient graph style (fully visible graph).

Optional:

- `duration` (default `0`): continuous fade-to-visible duration
- `at`

## 7.4 Node Size Actions

### `changeNodeSizeMode`
Transitions node sizing to a different graph metric mode.

Required:

- `mode` (`"default" | "_pagerank" | "_degree_centrality" | "_betweenness_centrality" | "_descendant_ratio" | "_prerequisite_ratio" | "_reachability_ratio"`)

Optional:

- `duration` (default `0`): continuous size interpolation duration
- `at`

Notes:

- `duration: 0` applies the new size mode immediately.
- The transition is deterministic during timeline seeking/rendering.

## 7.5 Relationship Emphasis

### `highlightNeighbors`
Selects a node and enables both prerequisite and dependent highlighting.

Required:

- `nodeId` (string)

Optional:

- selection options from `selectNode` (e.g., `append`, `appendToSelection`)
- `at`, `duration`

### `highlightDescendants`
Selects a node and highlights only descendants up to a maximum depth.

Required:

- `nodeId` (string)
- `level` (non-negative integer): number of descendant levels to include (`0` = just the selected node)

Optional:

- selection options from `selectNode` (e.g., `append`, `appendToSelection`)
- `at`, `duration`

### `highlightDependencies`
Selects a node and highlights only dependencies (prerequisites) up to a maximum depth.

Required:

- `nodeId` (string)
- `level` (non-negative integer): number of dependency levels to include (`0` = just the selected node)

Optional:

- selection options from `selectNode` (e.g., `append`, `appendToSelection`)
- `at`, `duration`

### `highlightCategory`
Highlights all nodes in a category using the same contextual fade treatment as multi-node selection.
Edges whose endpoints are both inside the category are highlighted as well.

Required:

- `category` (string)

Category resolution:

1. exact category name
2. case-insensitive full category name
3. slugified category name
4. unique case-insensitive substring match

Optional:

- `at`, `duration`

### `highlightDepthGroupNodes`
Highlights all nodes at a specific graph depth level.

Required:

- `level` (non-negative integer): exact node depth to highlight

Optional:

- `at`, `duration`

### `highlightDepthEdges`
Highlights all edges whose endpoints are between two depth levels (inclusive range).

Required:

- `from` (non-negative integer): range start depth
- `to` (non-negative integer): range end depth

Notes:

- `from`/`to` order is normalized automatically; `from > to` is allowed.

Optional:

- `at`, `duration`

### `highlightLowerSlice`
Highlights all nodes and edges at depth levels less than or equal to `to`.

Required:

- `to` (non-negative integer): upper depth boundary for the lower slice

Optional:

- `at`, `duration`

### `highlightUpperSlice`
Highlights all nodes and edges at depth levels greater than or equal to `from`.

Required:

- `from` (non-negative integer): lower depth boundary for the upper slice

Optional:

- `at`, `duration`

## 7.6 Tooltip / Label Actions

### `openTooltip`
Opens or updates a tooltip anchored to a node. Multiple node tooltips can be open at once.

Required:

- `nodeId` (string)

Optional:

- `opacity` (number in `[0,1]`, default `1`)
- `size` (`"small" | "medium" | "large"`, default `"medium"`)
- `duration` (enables fade over time)
- `at`

Aliases:

- `openNodeTooltip` -> `openTooltip`

### `closeTooltip`
Closes a specific node tooltip by fading opacity to zero.

Required:

- `nodeId` (string)

Optional:

- `duration` (default `0`)
- `at`

Aliases:

- `closeNodeTooltip` -> `closeTooltip`

### `fadeLabel`
Fades tooltip opacity to target value; can also retarget tooltip to a node first.

Required:

- `nodeId` (string)

Optional:

- `opacity` (number in `[0,1]`, default `1`)
- `duration` (default `0`)
- `at`

### `closeAllTooltips`
Closes all currently open tooltips by fading their opacity to zero.

Optional:

- `duration` (default `0`)
- `at`

## 8. Action Name Summary

Canonical actions:

- `selectNode`
- `unselectNode`
- `focusNode`
- `cameraFocus`
- `moveCamera`
- `changeLayout`
- `changeNodeSizeMode`
- `highlightNeighbors`
- `highlightDescendants`
- `highlightDependencies`
- `highlightCategory`
- `highlightDepthGroupNodes`
- `highlightDepthEdges`
- `highlightLowerSlice`
- `highlightUpperSlice`
- `hideGraph`
- `fadeGraph`
- `revealGraph`
- `openTooltip`
- `closeTooltip`
- `closeAllTooltips`
- `fadeLabel`
- `orbit`
- `autoRotate`
- `zoomTo`

Accepted aliases:

- `select` -> `selectNode`
- `unselect` -> `unselectNode`
- `focus` -> `cameraFocus`
- `focusCamera` -> `cameraFocus`
- `move` -> `moveCamera`
- `cameraMove` -> `moveCamera`
- `rotateCamera` -> `autoRotate`
- `openNodeTooltip` -> `openTooltip`
- `closeNodeTooltip` -> `closeTooltip`

## 9. CLI Renderer (`scripts/render-graph-video.mjs`)

## Usage

```bash
node scripts/render-graph-video.mjs --script ./scripts/video-script.example.json [options]
```

## Required

- `--script, -s <path>`: path to JSON timeline script

## Options

- `--output, -o <path>`: output video path (default `./tmp/graph-video.mp4`)
- `--fps <number>`: frame rate (default `30`)
- `--width <number>`: viewport width (default `1920`)
- `--height <number>`: viewport height (default `1080`)
- `--url <http(s)://...>`: use external/already-running page URL (skips local static server)
- `--frames-dir <path>`: custom directory for PNG frames
- `--keep-frames`: keep PNGs after ffmpeg encode
- `--high-quality`: use lossless 4:4:4 H.264 encode (`crf=0`, larger files, slower)
- `--verbose, -v`: enable detailed diagnostics
- `--help, -h`: print usage

## Runtime behavior

- Validates `fps/width/height` are positive numbers
- Ensures `ffmpeg` is in `PATH`
- Loads Puppeteer dynamically
- Uses a local static server when `--url` is not provided
- Launches Chromium with WebGL-friendly flags:
  - `--disable-dev-shm-usage`
  - `--ignore-gpu-blocklist`
  - `--use-angle=swiftshader`
  - `--enable-unsafe-swiftshader`
- If Chromium sandbox startup fails, retries with:
  - `--no-sandbox`
  - `--disable-setuid-sandbox`
- Navigates using `domcontentloaded` and waits for `window.graphVideo`
- Prints a continuously-updated render status line with current measured FPS, average FPS, and ETA
- Captures one PNG per frame as `frame-000000.png`, `frame-000001.png`, ...
- Encodes with ffmpeg (`libx264`, `yuv420p`, `+faststart`)
- `--high-quality` switches ffmpeg to lossless 4:4:4 output (`libx264`, `crf=0`, `yuv444p`, `high444`)

## ffmpeg command shape

```bash
ffmpeg -y \
  -framerate <fps> \
  -start_number 0 \
  -i <framesDir>/frame-%06d.png \
  -vf "pad=ceil(iw/2)*2:ceil(ih/2)*2" \
  -c:v libx264 \
  -preset veryfast \
  -pix_fmt yuv420p \
  -movflags +faststart \
  <output>
```

With `--high-quality`, ffmpeg switches to:

```bash
ffmpeg -y \
  -framerate <fps> \
  -start_number 0 \
  -i <framesDir>/frame-%06d.png \
  -vf "pad=ceil(iw/2)*2:ceil(ih/2)*2" \
  -c:v libx264 \
  -preset veryslow \
  -crf 0 \
  -pix_fmt yuv444p \
  -profile:v high444 \
  -movflags +faststart \
  <output>
```

## 10. Validation and Error Rules

Common script validation failures:

- action is not an object
- unsupported `action` name
- unknown node reference
- invalid vec3 format or non-finite coordinates
- invalid `level` (must be a non-negative integer)
- invalid node size `mode`
- invalid `from` / `to` depth parameters (must be non-negative integers)
- camera action with `duration <= 0`
- invalid `axis`
- missing required arguments for action
- overlapping camera actions in timeline
- overlapping layout actions in timeline

Renderer runtime failures:

- missing `ffmpeg`
- missing `puppeteer`
- page navigation timeout
- `window.graphVideo` readiness timeout
- zero PNG frames generated
- ffmpeg encode failure

## 11. Example Script

See:

- `scripts/video-script.example.json`

It demonstrates:

- selection + context (`focusNode`)
- camera motion (`moveCamera`, `autoRotate`, `cameraFocus`, `zoomTo`)
- tooltip control (`openTooltip`, `fadeLabel`, `closeTooltip`, `closeAllTooltips`)
- visibility control (`hideGraph`, `revealGraph`, `fadeGraph`)
