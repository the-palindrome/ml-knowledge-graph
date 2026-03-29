// Graph data loading, derived property computation, and graph algorithms

// --- Category color system ---
// Each unique category gets a distinct hue. We assign hues after loading
// based on sorted category names for stable, well-spaced hues.

let categoryHueMap = new Map();   // category → hue (0-360)
let sortedCategories = [];        // categories sorted alphabetically

export function getCategoryColor(category) {
  const hue = categoryHueMap.get(category);
  if (hue !== undefined) return { h: hue / 360, s: 0.7, l: 0.6 };
  return { h: 0.5, s: 0.3, l: 0.5 }; // fallback for unknown
}

export function getCategoryColorHex(category) {
  const { h, s, l } = getCategoryColor(category);
  return hslToHex(h, s, l);
}

export function getSortedCategories() { return sortedCategories; }

function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h * 6) % 2 - 1));
  const m = l - c / 2;
  let r, g, b;
  const sector = Math.floor(h * 6) % 6;
  switch (sector) {
    case 0: r = c; g = x; b = 0; break;
    case 1: r = x; g = c; b = 0; break;
    case 2: r = 0; g = c; b = x; break;
    case 3: r = 0; g = x; b = c; break;
    case 4: r = x; g = 0; b = c; break;
    case 5: r = c; g = 0; b = x; break;
    default: r = 0; g = 0; b = 0;
  }
  const toHex = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// --- Data loading ---

export async function loadGraph(url) {
  const response = await fetch(url);
  const data = await response.json();

  const nodeMap = new Map();
  const nodes = [];

  for (const raw of data) {
    const node = {
      ...raw,
      id: raw.id,
      label: raw.label,
      category: raw.category || '',
      definition: raw.definition || '',
      long_description: raw.long_description || '',
      to: raw.to || [],
      from: raw.from || [],
      depth: 0,
      descendantCount: 0,
      ancestorCount: 0,
      radius: 1.5,
      x: 0, y: 0, z: 0,
      _baseScale: 1.5,
      _currentScale: 1.5,
    };
    nodeMap.set(node.id, node);
    nodes.push(node);
  }

  // Filter out references to nonexistent nodes
  for (const node of nodes) {
    node.to = node.to.filter(id => nodeMap.has(id));
    node.from = node.from.filter(id => nodeMap.has(id));
  }

  computeDepths(nodeMap);
  computeDescendantCounts(nodeMap);
  buildCategoryColorMap(nodes);
  computeRadii(nodes);

  const edges = [];
  for (const node of nodes) {
    for (const targetId of node.to) {
      edges.push({ source: node.id, target: targetId });
    }
  }

  return { nodes, nodeMap, edges };
}

// --- Derived property computation ---

function computeDepths(nodeMap) {
  const computing = new Set();

  function dfs(nodeId) {
    const node = nodeMap.get(nodeId);
    if (node._depthDone) return node.depth;
    if (computing.has(nodeId)) return 0; // cycle guard
    computing.add(nodeId);

    if (node.from.length === 0) {
      node.depth = 0;
    } else {
      let maxParent = 0;
      for (const pid of node.from) {
        maxParent = Math.max(maxParent, dfs(pid));
      }
      node.depth = maxParent + 1;
    }

    node._depthDone = true;
    computing.delete(nodeId);
    return node.depth;
  }

  for (const id of nodeMap.keys()) dfs(id);
}

function computeDescendantCounts(nodeMap) {
  for (const node of nodeMap.values()) {
    const visited = new Set();
    const queue = [...node.to];
    for (let q = 0; q < queue.length; q++) {
      const id = queue[q];
      if (visited.has(id)) continue;
      visited.add(id);
      const n = nodeMap.get(id);
      if (n) for (const cid of n.to) {
        if (!visited.has(cid)) queue.push(cid);
      }
    }
    node.descendantCount = visited.size;
  }
}

function buildCategoryColorMap(nodes) {
  const categorySet = new Set();
  for (const node of nodes) {
    if (node.category) categorySet.add(node.category);
  }

  sortedCategories = [...categorySet].sort();
  categoryHueMap = new Map();
  const count = sortedCategories.length || 1;
  sortedCategories.forEach((cat, i) => {
    categoryHueMap.set(cat, (i * 360 / count) % 360);
  });
}

function computeRadii(nodes) {
  for (const node of nodes) {
    const r = Math.max(1.5, Math.min(6.0, 2.0 * Math.log2(node.descendantCount + 1)));
    node.radius = r;
    node._baseScale = r;
    node._currentScale = r;
  }
}

// --- Graph traversal ---

function traverseReachable(nodeId, nodeMap, edgeKey) {
  const visited = new Set();
  const queue = [nodeId];
  for (let q = 0; q < queue.length; q++) {
    const current = queue[q];
    if (visited.has(current)) continue;
    visited.add(current);
    const node = nodeMap.get(current);
    if (!node) continue;
    for (const nextId of node[edgeKey]) {
      if (!visited.has(nextId)) queue.push(nextId);
    }
  }
  return visited;
}

export function getUpstream(nodeId, nodeMap) {
  return traverseReachable(nodeId, nodeMap, 'from');
}

export function getDownstream(nodeId, nodeMap) {
  return traverseReachable(nodeId, nodeMap, 'to');
}

export function getUpstreamDistances(startId, nodeMap) {
  const distances = new Map();
  const queue = [startId];
  distances.set(startId, 0);
  for (let q = 0; q < queue.length; q++) {
    const current = queue[q];
    const node = nodeMap.get(current);
    if (!node) continue;
    const d = distances.get(current);
    for (const pid of node.from) {
      if (!distances.has(pid)) {
        distances.set(pid, d + 1);
        queue.push(pid);
      }
    }
  }
  return distances;
}
