// Three.js scene setup, node/edge rendering, and visual state management

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { getCategoryColor } from "./graph.js";

let scene, camera, renderer, controls;
let instancedMesh = null;
let edgeLines = null;
let edgeArrows = null;
let edgeMat = null;
let edgePositions = null;
let highlightLayers = [];
let container = null;
let nodes = null;
let edgeList = null;
let nodeIdToIndex = null;
let nodeOpacityArray = null;
let animationPerformanceMode = false;
let animationPerformanceRequests = 0;
let deferredArrowRefresh = false;
let activeCameraAnimation = null;
let renderLoopStarted = false;
let renderLoopPaused = false;

const dummy = new THREE.Object3D();
const tempColor = new THREE.Color();
const raycaster = new THREE.Raycaster();
const mouseVec = new THREE.Vector2();
const projectVec = new THREE.Vector3();
const upVec = new THREE.Vector3(0, 1, 0);
const rightVec = new THREE.Vector3(1, 0, 0);
const dirVec = new THREE.Vector3();
const curveSource = new THREE.Vector3();
const curveControl = new THREE.Vector3();
const curveTarget = new THREE.Vector3();
const curvePrev = new THREE.Vector3();
const curveNext = new THREE.Vector3();
const curvePerp = new THREE.Vector3();
const curveOrtho = new THREE.Vector3();
const curveOffset = new THREE.Vector3();
const tangentA = new THREE.Vector3();
const tangentB = new THREE.Vector3();
const arrowPos = new THREE.Vector3();
const arrowDir = new THREE.Vector3();
const cameraSetPosition = new THREE.Vector3();
const cameraSetTarget = new THREE.Vector3();
const cameraStatePosition = new THREE.Vector3();
const cameraStateTarget = new THREE.Vector3();

const ARROW_RADIUS = 1.2;
const ARROW_HEIGHT = 3.8;
const EDGE_CURVE_SEGMENTS = 10;
const EDGE_CURVE_STRENGTH_BASE = 0.14;
const EDGE_CURVE_STRENGTH_VARIANCE = 0.1;
const EDGE_CURVE_MAX_BEND = 50;
const EDGE_LINE_WIDTH = 1.2;
const DEFAULT_MAX_PIXEL_RATIO = 1.3;
const ANIMATION_PIXEL_RATIO = 0.8;

function smootherStep(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function getTargetPixelRatio() {
  if (animationPerformanceMode) return ANIMATION_PIXEL_RATIO;
  return Math.min(window.devicePixelRatio || 1, DEFAULT_MAX_PIXEL_RATIO);
}

export function initRenderer(containerEl) {
  container = containerEl;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040506);
  scene.fog = new THREE.FogExp2(0x040506, 0.00023);

  camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / container.clientHeight,
    1,
    10000,
  );
  camera.position.set(0, 0, 500);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(getTargetPixelRatio());
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 50;
  controls.maxDistance = 5000;
  controls.enablePan = true;

  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(100, 200, 150);
  scene.add(dirLight);

  window.addEventListener("resize", onResize);
}

function onResize() {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(getTargetPixelRatio());
  renderer.setSize(container.clientWidth, container.clientHeight);
  const res = new THREE.Vector2(container.clientWidth, container.clientHeight);
  if (edgeMat) edgeMat.resolution.copy(res);
  for (const layer of highlightLayers) {
    if (layer.lineMaterial) layer.lineMaterial.resolution.copy(res);
  }
}

// --- Node meshes ---

export function createNodes(nodeArray) {
  nodes = nodeArray;
  nodeIdToIndex = new Map();
  for (let i = 0; i < nodes.length; i++) {
    nodeIdToIndex.set(nodes[i].id, i);
  }

  const geometry = new THREE.SphereGeometry(1, 12, 9);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 1.0,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `
attribute float instanceOpacity;
varying float vInstanceOpacity;
${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\n  vInstanceOpacity = instanceOpacity;",
    );

    shader.fragmentShader = `
varying float vInstanceOpacity;
${shader.fragmentShader}`.replace(
      "vec4 diffuseColor = vec4( diffuse, opacity );",
      "vec4 diffuseColor = vec4( diffuse, opacity * vInstanceOpacity );",
    );
  };
  material.customProgramCacheKey = () => "node-instance-opacity-v1";

  instancedMesh = new THREE.InstancedMesh(geometry, material, nodes.length);
  instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  nodeOpacityArray = new Float32Array(nodes.length);
  nodeOpacityArray.fill(1);
  geometry.setAttribute(
    "instanceOpacity",
    new THREE.InstancedBufferAttribute(nodeOpacityArray, 1),
  );

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const { h, s, l } = getCategoryColor(node.category);
    tempColor.setHSL(h, s, l);
    instancedMesh.setColorAt(i, tempColor);

    dummy.position.set(node.x, node.y, node.z);
    dummy.scale.setScalar(node._baseScale);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(i, dummy.matrix);
  }

  instancedMesh.instanceColor.needsUpdate = true;
  instancedMesh.instanceMatrix.needsUpdate = true;
  instancedMesh.geometry.attributes.instanceOpacity.needsUpdate = true;
  instancedMesh.renderOrder = 2; // render nodes on top of edges
  scene.add(instancedMesh);
}

// --- Edge lines (thick with arrows) ---

export function createEdges(edges, nodeArray) {
  edgeList = [];
  for (const edge of edges) {
    const si = nodeIdToIndex.get(edge.source);
    const ti = nodeIdToIndex.get(edge.target);
    if (si !== undefined && ti !== undefined) {
      edgeList.push(createEdgeDescriptor(si, ti));
    }
  }

  // Thick line segments via LineMaterial
  edgePositions = new Float32Array(edgeList.length * EDGE_CURVE_SEGMENTS * 6);
  fillEdgePositions(edgeList, edgePositions);
  const geo = new LineSegmentsGeometry();
  geo.setPositions(edgePositions);

  edgeMat = new LineMaterial({
    color: 0x2c3138,
    linewidth: EDGE_LINE_WIDTH,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    resolution: new THREE.Vector2(
      container.clientWidth,
      container.clientHeight,
    ),
  });

  edgeLines = new LineSegments2(geo, edgeMat);
  edgeLines.computeLineDistances();
  scene.add(edgeLines);

  // Arrowheads
  buildEdgeArrows();
}

function fillEdgePositions(list, arr) {
  let off = 0;
  for (let i = 0; i < list.length; i++) {
    computeCurveFrame(list[i], curveSource, curveControl, curveTarget);
    evaluateQuadraticPoint(
      0,
      curveSource,
      curveControl,
      curveTarget,
      curvePrev,
    );
    for (let seg = 1; seg <= EDGE_CURVE_SEGMENTS; seg++) {
      const t = seg / EDGE_CURVE_SEGMENTS;
      evaluateQuadraticPoint(
        t,
        curveSource,
        curveControl,
        curveTarget,
        curveNext,
      );
      arr[off] = curvePrev.x;
      arr[off + 1] = curvePrev.y;
      arr[off + 2] = curvePrev.z;
      arr[off + 3] = curveNext.x;
      arr[off + 4] = curveNext.y;
      arr[off + 5] = curveNext.z;
      off += 6;
      curvePrev.copy(curveNext);
    }
  }
}

function updateLinePositions(lineMesh, list, arr) {
  fillEdgePositions(list, arr);

  const geometry = lineMesh.geometry;
  const instanceStart = geometry.attributes.instanceStart;
  if (
    instanceStart?.data?.array &&
    instanceStart.data.array.length === arr.length
  ) {
    instanceStart.data.array.set(arr);
    instanceStart.data.needsUpdate = true;
    geometry.boundingSphere = null;
    return;
  }

  geometry.setPositions(arr);
}

function buildEdgeArrows() {
  if (edgeArrows) {
    scene.remove(edgeArrows);
    edgeArrows.geometry.dispose();
    edgeArrows.material.dispose();
  }

  const coneGeo = new THREE.ConeGeometry(ARROW_RADIUS, ARROW_HEIGHT, 3);
  // Shift so the tip (apex) is at local origin — body extends down -Y
  coneGeo.translate(0, -ARROW_HEIGHT / 2, 0);

  const coneMat = new THREE.MeshBasicMaterial({
    color: 0x2f353d,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });

  edgeArrows = new THREE.InstancedMesh(coneGeo, coneMat, edgeList.length);
  edgeArrows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  positionArrows(edgeArrows, edgeList);
  edgeArrows.visible = !animationPerformanceMode;
  scene.add(edgeArrows);
}

function positionArrows(arrowMesh, list) {
  for (let i = 0; i < list.length; i++) {
    const edge = list[i];
    const len = computeCurveFrame(edge, curveSource, curveControl, curveTarget);
    if (len < 0.001) {
      dummy.scale.setScalar(0);
      dummy.position.set(0, 0, 0);
      dummy.updateMatrix();
      arrowMesh.setMatrixAt(i, dummy.matrix);
      continue;
    }

    const arrowT = edge.arrowT ?? 0.6;
    evaluateQuadraticPoint(
      arrowT,
      curveSource,
      curveControl,
      curveTarget,
      arrowPos,
    );
    evaluateQuadraticTangent(
      arrowT,
      curveSource,
      curveControl,
      curveTarget,
      arrowDir,
    );
    const arrowDirLength = arrowDir.length();
    if (arrowDirLength < 0.001) {
      dummy.scale.setScalar(0);
      dummy.position.set(0, 0, 0);
      dummy.updateMatrix();
      arrowMesh.setMatrixAt(i, dummy.matrix);
      continue;
    }
    arrowDir.divideScalar(arrowDirLength);

    dummy.position.copy(arrowPos);
    // Orient cone so +Y (tip direction) follows edge flow
    dummy.quaternion.setFromUnitVectors(upVec, arrowDir);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    arrowMesh.setMatrixAt(i, dummy.matrix);
  }
  arrowMesh.instanceMatrix.needsUpdate = true;
}

function computeCurveFrame(edge, sourceOut, controlOut, targetOut) {
  const s = nodes[edge.si];
  const t = nodes[edge.ti];
  sourceOut.set(s.x, s.y, s.z);
  targetOut.set(t.x, t.y, t.z);

  dirVec.subVectors(targetOut, sourceOut);
  const len = dirVec.length();
  if (len < 0.001) {
    controlOut.addVectors(sourceOut, targetOut).multiplyScalar(0.5);
    return len;
  }

  dirVec.divideScalar(len);
  curvePerp.crossVectors(dirVec, upVec);
  if (curvePerp.lengthSq() < 0.0001) {
    curvePerp.crossVectors(dirVec, rightVec);
  }
  curvePerp.normalize();
  curveOrtho.crossVectors(dirVec, curvePerp).normalize();

  const phase = edge.curvePhase ?? 0;
  curveOffset.copy(curvePerp).multiplyScalar(Math.cos(phase));
  curveOffset.addScaledVector(curveOrtho, Math.sin(phase));

  const curvature =
    EDGE_CURVE_STRENGTH_BASE +
    (edge.curveStrength ?? 0.5) * EDGE_CURVE_STRENGTH_VARIANCE;
  const bend = Math.min(len * curvature, EDGE_CURVE_MAX_BEND);
  controlOut.addVectors(sourceOut, targetOut).multiplyScalar(0.5);
  controlOut.addScaledVector(curveOffset, bend);

  return len;
}

function evaluateQuadraticPoint(t, source, control, target, out) {
  const nt = 1 - t;
  const k0 = nt * nt;
  const k1 = 2 * nt * t;
  const k2 = t * t;
  out.set(
    source.x * k0 + control.x * k1 + target.x * k2,
    source.y * k0 + control.y * k1 + target.y * k2,
    source.z * k0 + control.z * k1 + target.z * k2,
  );
}

function evaluateQuadraticTangent(t, source, control, target, out) {
  const nt = 1 - t;
  tangentA.subVectors(control, source).multiplyScalar(2 * nt);
  tangentB.subVectors(target, control).multiplyScalar(2 * t);
  out.copy(tangentA).add(tangentB);
}

function hashEdge(si, ti) {
  let hash = ((si + 1) * 374761393) ^ ((ti + 1) * 668265263);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 1274126177);
  return hash >>> 0;
}

function createEdgeDescriptor(si, ti) {
  const hash = hashEdge(si, ti);
  return {
    si,
    ti,
    curvePhase: ((hash & 1023) / 1023) * Math.PI * 2,
    curveStrength: ((hash >>> 10) & 255) / 255,
    arrowT: 0.48 + (((hash >>> 18) & 255) / 255) * 0.24,
  };
}

// --- Position / visual updates ---

export function updatePositions(options = {}) {
  const updateArrows = options.updateArrows ?? !animationPerformanceMode;
  const updateEdges = options.updateEdges ?? true;
  if (!instancedMesh || !nodes) return;

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    dummy.position.set(n.x, n.y, n.z);
    dummy.scale.setScalar(n._currentScale);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(i, dummy.matrix);
  }
  instancedMesh.instanceMatrix.needsUpdate = true;
  instancedMesh.boundingSphere = null; // invalidate so raycaster recomputes after layout change

  if (updateEdges && edgeLines && edgeList && edgePositions) {
    updateLinePositions(edgeLines, edgeList, edgePositions);
  }

  if (edgeArrows && edgeList) {
    if (updateArrows && !animationPerformanceMode) {
      positionArrows(edgeArrows, edgeList);
    } else {
      deferredArrowRefresh = true;
    }
  }

  for (const layer of highlightLayers) {
    if (updateEdges && layer.lines && layer.edgeList && layer.positions) {
      updateLinePositions(layer.lines, layer.edgeList, layer.positions);
    }

    if (layer.arrows && layer.edgeList) {
      if (updateArrows && !animationPerformanceMode) {
        positionArrows(layer.arrows, layer.edgeList);
      } else {
        deferredArrowRefresh = true;
      }
    }
  }
}

export function updateColors(colorMap) {
  if (!instancedMesh) return;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const c = colorMap ? colorMap.get(node.id) : null;
    const alpha = c && typeof c.a === "number" ? c.a : 1;
    if (c) {
      tempColor.setHSL(c.h, c.s, c.l);
    } else {
      const def = getCategoryColor(node.category);
      tempColor.setHSL(def.h, def.s, def.l);
    }
    instancedMesh.setColorAt(i, tempColor);
    if (nodeOpacityArray) nodeOpacityArray[i] = alpha;
  }
  instancedMesh.instanceColor.needsUpdate = true;
  if (instancedMesh.geometry.attributes.instanceOpacity) {
    instancedMesh.geometry.attributes.instanceOpacity.needsUpdate = true;
  }
}

export function setEdgeOpacity(opacity) {
  if (edgeMat) edgeMat.opacity = opacity;
  if (edgeArrows) edgeArrows.material.opacity = opacity;
}

// --- Highlight edges ---

export function showHighlightEdges(nodeSet, colorHex) {
  showHighlightEdgeGroups([{ nodeSet, colorHex }]);
}

export function showHighlightEdgeGroups(groups) {
  clearHighlightEdges();
  if (!groups || groups.length === 0) return;

  for (const group of groups) {
    if (!group?.nodeSet || group.nodeSet.size === 0) continue;
    const pairs = collectPairsForNodeSet(group.nodeSet);
    if (pairs.length === 0) continue;
    const layer = createHighlightLayer(
      pairs,
      group.colorHex,
      group.linewidth,
      group.opacity,
    );
    highlightLayers.push(layer);
  }
}

function collectPairsForNodeSet(nodeSet) {
  const pairs = [];
  for (const nodeId of nodeSet) {
    const idx = nodeIdToIndex.get(nodeId);
    if (idx === undefined) continue;
    const node = nodes[idx];
    for (const pid of node.from) {
      if (!nodeSet.has(pid)) continue;
      const sourceIndex = nodeIdToIndex.get(pid);
      if (sourceIndex !== undefined) {
        pairs.push(createEdgeDescriptor(sourceIndex, idx));
      }
    }
  }
  return pairs;
}

function createHighlightLayer(
  pairs,
  colorHex,
  linewidth = EDGE_LINE_WIDTH,
  opacity = 0.6,
) {
  const positions = new Float32Array(pairs.length * EDGE_CURVE_SEGMENTS * 6);
  fillEdgePositions(pairs, positions);
  const geo = new LineSegmentsGeometry();
  geo.setPositions(positions);

  const lineMaterial = new LineMaterial({
    color: new THREE.Color(colorHex),
    linewidth,
    transparent: true,
    opacity,
    depthTest: true,
    depthWrite: false,
    resolution: new THREE.Vector2(
      container.clientWidth,
      container.clientHeight,
    ),
  });

  const lines = new LineSegments2(geo, lineMaterial);
  lines.computeLineDistances();
  lines.renderOrder = 1;
  scene.add(lines);

  // Highlight arrowheads (slightly larger)
  const hlRadius = ARROW_RADIUS * 1.4;
  const hlHeight = ARROW_HEIGHT * 1.4;
  const coneGeo = new THREE.ConeGeometry(hlRadius, hlHeight, 3);
  coneGeo.translate(0, -hlHeight / 2, 0);

  const coneMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(colorHex),
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });

  const arrows = new THREE.InstancedMesh(coneGeo, coneMat, pairs.length);
  arrows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  arrows.renderOrder = 1;
  positionArrows(arrows, pairs);
  arrows.visible = !animationPerformanceMode;
  scene.add(arrows);

  return {
    edgeList: pairs,
    positions,
    lines,
    arrows,
    lineMaterial,
  };
}

export function clearHighlightEdges() {
  for (const layer of highlightLayers) {
    if (layer.lines) {
      scene.remove(layer.lines);
      layer.lines.geometry.dispose();
      layer.lines.material.dispose();
    }
    if (layer.arrows) {
      scene.remove(layer.arrows);
      layer.arrows.geometry.dispose();
      layer.arrows.material.dispose();
    }
  }
  highlightLayers = [];
}

export function setAnimationPerformanceMode(enabled) {
  animationPerformanceRequests = Math.max(
    0,
    animationPerformanceRequests + (enabled ? 1 : -1),
  );
  animationPerformanceMode = animationPerformanceRequests > 0;

  if (edgeArrows) edgeArrows.visible = !animationPerformanceMode;
  for (const layer of highlightLayers) {
    if (layer.arrows) layer.arrows.visible = !animationPerformanceMode;
  }

  if (!animationPerformanceMode && deferredArrowRefresh) {
    deferredArrowRefresh = false;
    if (edgeArrows && edgeList) positionArrows(edgeArrows, edgeList);
    for (const layer of highlightLayers) {
      if (layer.arrows && layer.edgeList) {
        positionArrows(layer.arrows, layer.edgeList);
      }
    }
  }

  if (renderer) onResize();
}

// --- Raycasting ---

export function getNodeAtScreen(mx, my) {
  if (!instancedMesh) return null;
  mouseVec.set(mx, my);
  raycaster.setFromCamera(mouseVec, camera);
  const hits = raycaster.intersectObject(instancedMesh);
  if (hits.length > 0) {
    return nodes[hits[0].instanceId].id;
  }
  return null;
}

// --- Projection ---

export function projectToScreen(nodeId) {
  const idx = nodeIdToIndex.get(nodeId);
  if (idx === undefined) return null;
  const n = nodes[idx];
  projectVec.set(n.x, n.y, n.z).project(camera);
  return {
    x: (projectVec.x * 0.5 + 0.5) * container.clientWidth,
    y: (-projectVec.y * 0.5 + 0.5) * container.clientHeight,
    behind: projectVec.z > 1,
  };
}

// --- Camera ---

export function animateCamera(tx, ty, tz, duration = 600) {
  if (activeCameraAnimation) {
    cancelAnimationFrame(activeCameraAnimation.rafId);
    setAnimationPerformanceMode(false);
    activeCameraAnimation = null;
  }

  const start = controls.target.clone();
  const end = new THREE.Vector3(tx, ty, tz);
  const t0 = performance.now();
  setAnimationPerformanceMode(true);

  function step(time) {
    const t = Math.min((time - t0) / duration, 1);
    controls.target.lerpVectors(start, end, smootherStep(t));

    if (t < 1) {
      activeCameraAnimation.rafId = requestAnimationFrame(step);
      return;
    }

    controls.target.copy(end);
    setAnimationPerformanceMode(false);
    activeCameraAnimation = null;
  }

  activeCameraAnimation = { rafId: requestAnimationFrame(step) };
}

export function fitCameraToGraph() {
  if (!nodes || nodes.length === 0) return;

  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;
  let minZ = Infinity,
    maxZ = -Infinity;

  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
    if (n.z < minZ) minZ = n.z;
    if (n.z > maxZ) maxZ = n.z;
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 100);
  const dist = (maxDim * 1.2) / (2 * Math.tan((Math.PI * 30) / 180));

  camera.position.set(cx, cy, cz + dist);
  controls.target.set(cx, cy, cz);
  controls.update();
}

export function setAutoRotate(enabled) {
  if (!controls) return;
  controls.autoRotate = !!enabled;
  controls.autoRotateSpeed = 0.5;
}

export function setDeterministicMode(enabled) {
  if (!controls) return;
  const isEnabled = Boolean(enabled);
  controls.autoRotate = false;
  controls.enableDamping = !isEnabled;
  controls.dampingFactor = isEnabled ? 0 : 0.08;
  controls.update();
}

export function getCameraState() {
  if (!camera || !controls) {
    return null;
  }
  cameraStatePosition.copy(camera.position);
  cameraStateTarget.copy(controls.target);
  return {
    position: {
      x: cameraStatePosition.x,
      y: cameraStatePosition.y,
      z: cameraStatePosition.z,
    },
    target: {
      x: cameraStateTarget.x,
      y: cameraStateTarget.y,
      z: cameraStateTarget.z,
    },
  };
}

export function setCameraState(nextState) {
  if (!camera || !controls || !nextState) return;

  const position = nextState.position ?? {};
  const target = nextState.target ?? {};

  cameraSetPosition.set(
    Number.isFinite(position.x) ? position.x : camera.position.x,
    Number.isFinite(position.y) ? position.y : camera.position.y,
    Number.isFinite(position.z) ? position.z : camera.position.z,
  );
  cameraSetTarget.set(
    Number.isFinite(target.x) ? target.x : controls.target.x,
    Number.isFinite(target.y) ? target.y : controls.target.y,
    Number.isFinite(target.z) ? target.z : controls.target.z,
  );

  camera.position.copy(cameraSetPosition);
  controls.target.copy(cameraSetTarget);
  controls.update();
}

export function renderFrame({ updateControls = true } = {}) {
  if (!renderer || !camera) return;
  if (controls && updateControls) {
    controls.update();
  }
  renderer.render(scene, camera);
}

export function setRenderLoopPaused(paused) {
  renderLoopPaused = Boolean(paused);
}

// --- Render loop ---

export function startRenderLoop() {
  if (renderLoopStarted) return;
  renderLoopStarted = true;

  function animate() {
    requestAnimationFrame(animate);
    if (renderLoopPaused) return;
    renderFrame();
  }
  animate();
}

export function captureScreenshot() {
  // Render one frame with preserveDrawingBuffer behavior
  renderFrame({ updateControls: false });
  return renderer.domElement.toDataURL("image/png");
}

export function getContainer() {
  return container;
}
