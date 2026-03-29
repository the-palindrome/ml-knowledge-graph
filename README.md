# ML Knowledge Graph Explorer

Interactive 3D knowledge graph visualizer for 2,081 machine learning and mathematics concepts with 5,149 prerequisite edges. Explore the graph in three dimensions — rotate, zoom, pan — with multiple layout algorithms and upstream dependency highlighting.

## Local Development

No build step required. Serve the static files with any HTTP server:

```bash
# Python
python3 -m http.server 8000

# Node.js (npx, no install needed)
npx serve .
```

Then open http://localhost:8000 in your browser.

## Layout Cache

The app can optionally read `knowledge_graph.layout.json` at startup as a local cache of precomputed node positions for the default force layout.

- If the file exists and is valid, those cached positions are applied immediately.
- If the file is missing or invalid, the app falls back to computing the initial force layout in the browser.
- Hierarchical, cluster, and radial layouts are not read from this file; they are computed on demand when you switch layouts.

`knowledge_graph.layout.json` is treated as a generated local artifact and is ignored by git.

## Usage

- **Rotate**: drag
- **Zoom**: scroll
- **Pan**: right-drag
- **Click** a node to focus its prerequisite/dependent context
- **Shift+Click** additional nodes to build a multi-node selection group
- **Double-click** a node for ego-centric radial layout
- **Search** to filter concepts by name
- **Layout selector** to switch between Force, Hierarchical, Cluster, and Radial views
- **Legend** — click a cluster to highlight all its nodes

## Video Rendering Automation

The explorer now exposes a deterministic timeline API on `window.graphVideo`:

```js
window.graphVideo = {
  async runScript(script) { ... },
  async seek(t) { ... },
  async captureFrame() { ... }, // PNG data URL (base64)
  getDuration() { ... },
};
```

Supported script actions:

- `selectNode` / `unselectNode`
- `focusNode` (selection + camera focus)
- `cameraFocus` (camera-only focus)
- `moveCamera`
- `highlightNeighbors` (prerequisites + dependents)
- `highlightDescendants` (descendants up to `level`)
- `highlightDependencies` (dependencies up to `level`)
- `hideGraph` / `fadeGraph` / `revealGraph`
- `openTooltip` / `closeTooltip` / `fadeLabel`
- `orbit` / `autoRotate`
- `zoomTo`

Camera actions are interpolated over `duration` and are smooth by default.
If `duration` is omitted on a camera action, a default smooth duration is used.

Aliases are accepted for convenience:
`select`, `unselect`, `focus`, `focusCamera`, `move`, `cameraMove`, `rotateCamera`, `openNodeTooltip`, `closeNodeTooltip`.

Node references can use:

- internal node IDs
- node labels (case-insensitive)
- slug-style labels (for example `gradient-descent`)

### Render Script (Puppeteer + ffmpeg)

1. Install prerequisites:

```bash
npm install --save-dev puppeteer
# ffmpeg must also be installed and available in PATH
```

2. Run the renderer:

```bash
node scripts/render-graph-video.mjs \
  --script ./scripts/video-script.example.json \
  --output ./tmp/graph-video.mp4 \
  --fps 30 \
  --width 1920 \
  --height 1080 \
  --verbose
```

By default, the script:

- launches Puppeteer
- opens a local static server for this repo
- loads your timeline into `window.graphVideo`
- seeks frame-by-frame
- saves PNGs to a temporary frame directory
- stitches frames with `ffmpeg`

Use `--keep-frames` if you want to preserve individual PNGs.
Use `--verbose` to print detailed diagnostics (page errors, request failures, and per-frame seek/capture/write timing).
