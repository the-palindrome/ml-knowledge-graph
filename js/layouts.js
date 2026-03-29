// Layout algorithms: force-directed, hierarchical, cluster, radial

import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceX,
  forceY,
  forceZ
} from 'd3-force-3d';

const FORCE_MIN_TICKS = 120;
const FORCE_MAX_TICKS = 220;
const FORCE_ALPHA_STOP = 0.018;
const GOLDEN_SPIRAL_THETA_FACTOR = Math.PI * (1 + Math.sqrt(5));

function pushToGroup(groupMap, key, value) {
  if (!groupMap.has(key)) groupMap.set(key, []);
  groupMap.get(key).push(value);
}

function getGoldenSpiralPoint(index, count, radius, center = { x: 0, y: 0, z: 0 }) {
  const phi = Math.acos(1 - 2 * (index + 0.5) / count);
  const theta = GOLDEN_SPIRAL_THETA_FACTOR * index;
  const sinPhi = Math.sin(phi);
  return {
    x: center.x + radius * sinPhi * Math.cos(theta),
    y: center.y + radius * sinPhi * Math.sin(theta),
    z: center.z + radius * Math.cos(phi),
  };
}

// --- Force-directed layout (default) ---

export function computeForceLayout(nodes, edges) {
  const simNodes = nodes.map(n => ({
    id: n.id,
    category: n.category,
    x: (Math.random() - 0.5) * 100,
    y: (Math.random() - 0.5) * 100,
    z: (Math.random() - 0.5) * 100,
  }));
  const simLinks = edges.map(e => ({ source: e.source, target: e.target }));
  const catMap = new Map(nodes.map(n => [n.id, n.category]));

  const simulation = forceSimulation(simNodes, 3)
    .force('link', forceLink(simLinks).id(d => d.id).distance(30).strength(0.3))
    .force('charge', forceManyBody().strength(-80).theta(0.8).distanceMax(300))
    .force('center', forceCenter())
    .force('x', forceX(0).strength(0.02))
    .force('y', forceY(0).strength(0.02))
    .force('z', forceZ(0).strength(0.02))
    .force('cluster', createClusterForce(catMap, 0.15))
    .alphaDecay(0.035)
    .stop();

  const tickBudget = Math.max(
    FORCE_MIN_TICKS,
    Math.min(FORCE_MAX_TICKS, Math.round(110 + Math.sqrt(nodes.length) * 2))
  );
  for (let i = 0; i < tickBudget; i++) {
    simulation.tick();
    if (simulation.alpha() < FORCE_ALPHA_STOP) break;
  }

  const positions = new Map();
  for (const sn of simNodes) {
    positions.set(sn.id, { x: sn.x || 0, y: sn.y || 0, z: sn.z || 0 });
  }
  return positions;
}

function createClusterForce(catMap, strength) {
  let nodes;
  function force(alpha) {
    const centroids = new Map();
    for (const node of nodes) {
      const cat = catMap.get(node.id);
      if (!centroids.has(cat)) centroids.set(cat, { x: 0, y: 0, z: 0, count: 0 });
      const ct = centroids.get(cat);
      ct.x += node.x; ct.y += node.y; ct.z += node.z; ct.count++;
    }
    for (const ct of centroids.values()) {
      ct.x /= ct.count; ct.y /= ct.count; ct.z /= ct.count;
    }
    for (const node of nodes) {
      const ct = centroids.get(catMap.get(node.id));
      if (!ct) continue;
      node.vx += (ct.x - node.x) * strength * alpha;
      node.vy += (ct.y - node.y) * strength * alpha;
      node.vz += (ct.z - node.z) * strength * alpha;
    }
  }
  force.initialize = (_nodes) => { nodes = _nodes; };
  return force;
}

// --- Hierarchical layout (depth-based) ---

export function computeHierarchicalLayout(nodes) {
  const depthGroups = new Map();
  let maxDepth = 0;
  for (const node of nodes) {
    pushToGroup(depthGroups, node.depth, node);
    if (node.depth > maxDepth) maxDepth = node.depth;
  }

  const positions = new Map();

  for (const [depth, group] of depthGroups) {
    group.sort((a, b) => a.category.localeCompare(b.category));
    const y = (depth - maxDepth / 2) * 40;
    const radius = Math.max(20, group.length * 3);

    for (let i = 0; i < group.length; i++) {
      const angle = (i / group.length) * Math.PI * 2;
      positions.set(group[i].id, {
        x: Math.cos(angle) * radius + (Math.random() - 0.5) * 6,
        y,
        z: Math.sin(angle) * radius + (Math.random() - 0.5) * 6,
      });
    }
  }

  return positions;
}

// --- Cluster layout (community-based) ---

export function computeClusterLayout(nodes) {
  const clusterGroups = new Map();
  for (const node of nodes) {
    const cat = node.category || 'other';
    pushToGroup(clusterGroups, cat, node);
  }

  const positions = new Map();
  const clusters = [...clusterGroups.keys()];
  const sphereRadius = 300;

  // Distribute cluster centroids on a sphere via golden spiral
  const centroids = new Map();
  for (let i = 0; i < clusters.length; i++) {
    centroids.set(clusters[i], getGoldenSpiralPoint(i, clusters.length, sphereRadius));
  }

  // Arrange nodes within each cluster
  for (const [clusterId, group] of clusterGroups) {
    const center = centroids.get(clusterId);
    const r = Math.max(20, Math.sqrt(group.length) * 8);

    for (let i = 0; i < group.length; i++) {
      positions.set(group[i].id, getGoldenSpiralPoint(i, group.length, r, center));
    }
  }

  return positions;
}

// --- Radial layout (ego-centric) ---

export function computeRadialLayout(nodes, centerId, nodeMap) {
  // BFS hop distance from center (both directions)
  const distances = new Map();
  const queue = [centerId];
  distances.set(centerId, 0);

  for (let q = 0; q < queue.length; q++) {
    const current = queue[q];
    const node = nodeMap.get(current);
    if (!node) continue;
    const d = distances.get(current);
    for (const nid of [...node.from, ...node.to]) {
      if (!distances.has(nid) && nodeMap.has(nid)) {
        distances.set(nid, d + 1);
        queue.push(nid);
      }
    }
  }

  const positions = new Map();
  positions.set(centerId, { x: 0, y: 0, z: 0 });

  // Group by hop distance
  const distGroups = new Map();
  for (const [nid, dist] of distances) {
    if (dist === 0) continue;
    pushToGroup(distGroups, dist, nid);
  }

  for (const [dist, group] of distGroups) {
    const radius = dist <= 5 ? dist * 40 : 200 + (dist - 5) * 10;
    for (let i = 0; i < group.length; i++) {
      positions.set(group[i], getGoldenSpiralPoint(i, group.length, radius));
    }
  }

  // Unreachable nodes on outer shell
  for (const node of nodes) {
    if (!positions.has(node.id)) {
      const phi = Math.random() * Math.PI;
      const theta = Math.random() * Math.PI * 2;
      const r = 250;
      positions.set(node.id, {
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.sin(phi) * Math.sin(theta),
        z: r * Math.cos(phi),
      });
    }
  }

  return positions;
}

// --- Layout transition animation ---

function smootherStep(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function animateToPositions(nodes, targetPositions, onUpdate, duration = 900) {
  return new Promise(resolve => {
    const starts = new Array(nodes.length);
    const targets = new Array(nodes.length);

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      starts[i] = { x: node.x, y: node.y, z: node.z };
      targets[i] = targetPositions.get(node.id) || starts[i];
    }

    const t0 = performance.now();
    let frame = 0;

    function step(time) {
      const t = Math.min((time - t0) / duration, 1);
      const eased = smootherStep(t);

      for (let i = 0; i < nodes.length; i++) {
        const start = starts[i];
        const target = targets[i];
        nodes[i].x = start.x + (target.x - start.x) * eased;
        nodes[i].y = start.y + (target.y - start.y) * eased;
        nodes[i].z = start.z + (target.z - start.z) * eased;
      }

      frame += 1;
      onUpdate({ frame, progress: t, isFinalFrame: t >= 1 });

      if (t < 1) {
        requestAnimationFrame(step);
        return;
      }

      for (let i = 0; i < nodes.length; i++) {
        const target = targets[i];
        nodes[i].x = target.x;
        nodes[i].y = target.y;
        nodes[i].z = target.z;
      }

      resolve();
    }

    requestAnimationFrame(step);
  });
}
