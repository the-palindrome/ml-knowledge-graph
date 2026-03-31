// Three.js scene setup, node/edge rendering, and visual state management

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { getCategoryColor } from "./graph.js";

let scene, camera, renderer, controls;
let opaqueNodeMesh = null;
let transparentNodeMesh = null;
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
let nodeColorCurrentArray = null;
let nodeColorStartArray = null;
let nodeColorTargetArray = null;
let nodeAlphaCurrentArray = null;
let nodeAlphaStartArray = null;
let nodeAlphaTargetArray = null;
let nodeScaleCurrentArray = null;
let nodeScaleStartArray = null;
let nodeScaleTargetArray = null;
let activeColorTransition = null;
let activeScaleTransition = null;
let animationPerformanceMode = false;
let animationPerformanceRequests = 0;
let deferredArrowRefresh = false;
let activeCameraAnimation = null;
let renderLoopStarted = false;
let renderLoopPaused = false;
let videoRenderMode = false;
let edgeDirectionVisible = true;
let postRenderCallback = null;
let pngEncoderWarmed = false;
let screenshotCanvas = null;
let screenshotContext = null;
let videoCaptureStream = null;
let videoCaptureTrack = null;
let videoImageCapture = null;

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

const ARROW_RADIUS = 1.0;
const ARROW_HEIGHT = 2.4;
const ARROWS_PER_EDGE = 5;
const SHOW_EDGE_ARROWS = true;
const ARROW_T_START = 0.08;
const ARROW_T_END = 0.92;
const DEFAULT_EDGE_CURVE_SEGMENTS = 24;
const VIDEO_EDGE_CURVE_SEGMENTS = 4;
const EDGE_CURVE_STRENGTH_BASE = 0.14;
const EDGE_CURVE_STRENGTH_VARIANCE = 0.1;
const EDGE_CURVE_MAX_BEND = 50;
const EDGE_LINE_WIDTH = 0.85;
const DEFAULT_MAX_PIXEL_RATIO = 2.0;
const ANIMATION_PIXEL_RATIO = 1.0;
const DEFAULT_NODE_GEOMETRY_DETAIL = { widthSegments: 32, heightSegments: 24 };
const VIDEO_NODE_GEOMETRY_DETAIL = { widthSegments: 6, heightSegments: 4 };
const NODE_BASE_OPACITY = 1.0;
const OPAQUE_NODE_ALPHA_CUTOFF = 0.999;
const HIDDEN_NODE_ALPHA_EPSILON = 0.001;
const NODE_COLOR_TRANSITION_DURATION_MS = 320;
const NODE_SCALE_TRANSITION_DURATION_MS = 320;
const TRANSITION_COMPLETE_EPSILON = 1e-6;
const TRANSITION_VALUE_EPSILON = 1e-4;

function createNodeGeometry({ widthSegments, heightSegments }) {
  const geometry = new THREE.SphereGeometry(1, widthSegments, heightSegments);
  if (nodeOpacityArray) {
    geometry.setAttribute(
      "instanceOpacity",
      new THREE.InstancedBufferAttribute(nodeOpacityArray, 1),
    );
  }
  return geometry;
}

function getNodeGeometryForCurrentMode() {
  return createNodeGeometry(
    videoRenderMode ? VIDEO_NODE_GEOMETRY_DETAIL : DEFAULT_NODE_GEOMETRY_DETAIL,
  );
}

function forEachNodeMesh(visitor) {
  if (opaqueNodeMesh) visitor(opaqueNodeMesh, "opaque");
  if (transparentNodeMesh) visitor(transparentNodeMesh, "transparent");
}

function hasNodeMeshes() {
  return Boolean(opaqueNodeMesh && transparentNodeMesh);
}

function createNodeMaterial(pass) {
  const isTransparentPass = pass === "transparent";
  const material = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    transparent: isTransparentPass,
    opacity: NODE_BASE_OPACITY,
    depthTest: true,
    depthWrite: !isTransparentPass,
    shininess: 6,
    specular: new THREE.Color(0x22252d),
    emissive: new THREE.Color(0x090b11),
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
      isTransparentPass
        ? `if (vInstanceOpacity <= ${HIDDEN_NODE_ALPHA_EPSILON.toFixed(3)} || vInstanceOpacity >= ${OPAQUE_NODE_ALPHA_CUTOFF.toFixed(3)}) discard;
vec4 diffuseColor = vec4( diffuse, opacity * vInstanceOpacity );`
        : `if (vInstanceOpacity < ${OPAQUE_NODE_ALPHA_CUTOFF.toFixed(3)}) discard;
vec4 diffuseColor = vec4( diffuse, opacity );`,
    );
  };
  material.customProgramCacheKey = () => `node-instance-opacity-${pass}-v1`;
  return material;
}

function getEdgeCurveSegments() {
  return videoRenderMode ? VIDEO_EDGE_CURVE_SEGMENTS : DEFAULT_EDGE_CURVE_SEGMENTS;
}

function smootherStep(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function initializeNodeVisualState(nodeCount) {
  nodeColorCurrentArray = new Float32Array(nodeCount * 3);
  nodeColorStartArray = new Float32Array(nodeCount * 3);
  nodeColorTargetArray = new Float32Array(nodeCount * 3);
  nodeAlphaCurrentArray = new Float32Array(nodeCount);
  nodeAlphaStartArray = new Float32Array(nodeCount);
  nodeAlphaTargetArray = new Float32Array(nodeCount);
  nodeScaleCurrentArray = new Float32Array(nodeCount);
  nodeScaleStartArray = new Float32Array(nodeCount);
  nodeScaleTargetArray = new Float32Array(nodeCount);
  activeColorTransition = null;
  activeScaleTransition = null;
}

function setNodeColorState(index, h, s, l, a = 1) {
  const colorOffset = index * 3;
  nodeColorCurrentArray[colorOffset] = h;
  nodeColorCurrentArray[colorOffset + 1] = s;
  nodeColorCurrentArray[colorOffset + 2] = l;
  nodeColorStartArray[colorOffset] = h;
  nodeColorStartArray[colorOffset + 1] = s;
  nodeColorStartArray[colorOffset + 2] = l;
  nodeColorTargetArray[colorOffset] = h;
  nodeColorTargetArray[colorOffset + 1] = s;
  nodeColorTargetArray[colorOffset + 2] = l;

  nodeAlphaCurrentArray[index] = a;
  nodeAlphaStartArray[index] = a;
  nodeAlphaTargetArray[index] = a;
}

function setNodeScaleState(index, scale) {
  nodeScaleCurrentArray[index] = scale;
  nodeScaleStartArray[index] = scale;
  nodeScaleTargetArray[index] = scale;
}

function applyNodeColorStateToMesh() {
  if (!hasNodeMeshes() || !nodes || !nodeColorCurrentArray || !nodeAlphaCurrentArray) return;

  for (let i = 0; i < nodes.length; i++) {
    const colorOffset = i * 3;
    tempColor.setHSL(
      nodeColorCurrentArray[colorOffset],
      nodeColorCurrentArray[colorOffset + 1],
      nodeColorCurrentArray[colorOffset + 2],
    );
    forEachNodeMesh((mesh) => {
      mesh.setColorAt(i, tempColor);
    });
    if (nodeOpacityArray) {
      nodeOpacityArray[i] = nodeAlphaCurrentArray[i];
    }
  }

  forEachNodeMesh((mesh) => {
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    if (mesh.geometry.attributes.instanceOpacity) {
      mesh.geometry.attributes.instanceOpacity.needsUpdate = true;
    }
  });
}

function applyNodeTransformStateToMesh() {
  if (!hasNodeMeshes() || !nodes) return;

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const scale = nodeScaleCurrentArray
      ? nodeScaleCurrentArray[i]
      : n._currentScale;
    dummy.position.set(n.x, n.y, n.z);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    forEachNodeMesh((mesh) => {
      mesh.setMatrixAt(i, dummy.matrix);
    });
  }

  forEachNodeMesh((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.boundingSphere = null; // invalidate so raycaster recomputes after layout change
  });
}

function hasMeaningfulDelta(currentValue, targetValue) {
  return Math.abs(currentValue - targetValue) > TRANSITION_VALUE_EPSILON;
}

function beginColorTransition(now, durationMs = NODE_COLOR_TRANSITION_DURATION_MS) {
  nodeColorStartArray.set(nodeColorCurrentArray);
  nodeAlphaStartArray.set(nodeAlphaCurrentArray);
  activeColorTransition = {
    startTime: now,
    durationMs: Math.max(1, durationMs),
  };
}

function beginScaleTransition(now, durationMs = NODE_SCALE_TRANSITION_DURATION_MS) {
  nodeScaleStartArray.set(nodeScaleCurrentArray);
  activeScaleTransition = {
    startTime: now,
    durationMs: Math.max(1, durationMs),
  };
}

function advanceVisualTransitions(now, options = {}) {
  const {
    applyColors = true,
    applyTransforms = true,
  } = options;

  let didUpdateColors = false;
  let didUpdateTransforms = false;

  if (activeColorTransition && nodeColorCurrentArray && nodeAlphaCurrentArray) {
    const elapsed = now - activeColorTransition.startTime;
    const t = Math.min(Math.max(elapsed / activeColorTransition.durationMs, 0), 1);
    const easedT = smootherStep(t);

    for (let i = 0; i < nodeColorCurrentArray.length; i++) {
      const startValue = nodeColorStartArray[i];
      nodeColorCurrentArray[i] = startValue + (nodeColorTargetArray[i] - startValue) * easedT;
    }
    for (let i = 0; i < nodeAlphaCurrentArray.length; i++) {
      const startValue = nodeAlphaStartArray[i];
      nodeAlphaCurrentArray[i] = startValue + (nodeAlphaTargetArray[i] - startValue) * easedT;
    }
    didUpdateColors = true;

    if (t >= 1 - TRANSITION_COMPLETE_EPSILON) {
      nodeColorCurrentArray.set(nodeColorTargetArray);
      nodeAlphaCurrentArray.set(nodeAlphaTargetArray);
      activeColorTransition = null;
    }
  }

  if (activeScaleTransition && nodeScaleCurrentArray) {
    const elapsed = now - activeScaleTransition.startTime;
    const t = Math.min(Math.max(elapsed / activeScaleTransition.durationMs, 0), 1);
    const easedT = smootherStep(t);

    for (let i = 0; i < nodeScaleCurrentArray.length; i++) {
      const startValue = nodeScaleStartArray[i];
      nodeScaleCurrentArray[i] = startValue + (nodeScaleTargetArray[i] - startValue) * easedT;
    }
    didUpdateTransforms = true;

    if (t >= 1 - TRANSITION_COMPLETE_EPSILON) {
      nodeScaleCurrentArray.set(nodeScaleTargetArray);
      activeScaleTransition = null;
    }
  }

  if (didUpdateColors && applyColors) {
    applyNodeColorStateToMesh();
  }
  if (didUpdateTransforms && applyTransforms) {
    applyNodeTransformStateToMesh();
  }
}

function getTargetPixelRatio() {
  if (animationPerformanceMode) return ANIMATION_PIXEL_RATIO;
  return Math.min(window.devicePixelRatio || 1, DEFAULT_MAX_PIXEL_RATIO);
}

function warmPngEncoder() {
  if (pngEncoderWarmed || typeof document === "undefined") return false;

  try {
    const warmupCanvas = document.createElement("canvas");
    warmupCanvas.width = 1;
    warmupCanvas.height = 1;

    const context = warmupCanvas.getContext("2d");
    if (context) {
      context.fillStyle = "#000000";
      context.fillRect(0, 0, 1, 1);
    }
    warmupCanvas.toDataURL("image/png");
  } catch {
    // Best-effort warmup only; the main capture path remains authoritative.
  }
  pngEncoderWarmed = true;
  return false;
}

function encodeCanvasToDataUrl(targetCanvas, mimeType, quality) {
  if (typeof targetCanvas.toBlob !== "function") {
    return Promise.resolve(targetCanvas.toDataURL(mimeType, quality));
  }

  return new Promise((resolve, reject) => {
    targetCanvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Canvas encoding failed."));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error ?? new Error("Failed to read encoded canvas."));
      reader.readAsDataURL(blob);
    }, mimeType, quality);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read blob."));
    reader.readAsDataURL(blob);
  });
}

function getScreenshotCanvas(width, height) {
  if (!screenshotCanvas) {
    screenshotCanvas = document.createElement("canvas");
    screenshotContext = screenshotCanvas.getContext("2d");
  }

  if (screenshotCanvas.width !== width) {
    screenshotCanvas.width = width;
  }
  if (screenshotCanvas.height !== height) {
    screenshotCanvas.height = height;
  }

  return screenshotCanvas;
}

function ensureVideoImageCapture() {
  if (
    videoImageCapture
    && videoCaptureTrack
    && videoCaptureTrack.readyState === "live"
  ) {
    return videoImageCapture;
  }

  const sourceCanvas = renderer?.domElement;
  if (!sourceCanvas || typeof sourceCanvas.captureStream !== "function") {
    return null;
  }
  if (typeof ImageCapture !== "function") {
    return null;
  }

  videoCaptureStream = sourceCanvas.captureStream(0);
  const [track] = videoCaptureStream.getVideoTracks();
  if (!track) {
    return null;
  }

  videoCaptureTrack = track;
  videoImageCapture = new ImageCapture(track);
  return videoImageCapture;
}

export function initRenderer(containerEl) {
  container = containerEl;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x271828);
  scene.fog = new THREE.FogExp2(0x271828, 0.00023);

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
    preserveDrawingBuffer: false,
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

  scene.add(new THREE.HemisphereLight(0xffffff, 0x101321, 0.95));
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.78);
  keyLight.position.set(180, 220, 160);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0xffffff, 0.34);
  rimLight.position.set(-140, 90, -180);
  scene.add(rimLight);

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

  nodeOpacityArray = new Float32Array(nodes.length);
  nodeOpacityArray.fill(1);
  initializeNodeVisualState(nodes.length);

  const opaqueGeometry = getNodeGeometryForCurrentMode();
  const transparentGeometry = getNodeGeometryForCurrentMode();
  const opaqueMaterial = createNodeMaterial("opaque");
  const transparentMaterial = createNodeMaterial("transparent");

  opaqueNodeMesh = new THREE.InstancedMesh(opaqueGeometry, opaqueMaterial, nodes.length);
  transparentNodeMesh = new THREE.InstancedMesh(
    transparentGeometry,
    transparentMaterial,
    nodes.length,
  );
  opaqueNodeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  transparentNodeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const { h, s, l } = getCategoryColor(node.category);
    const scale = Number.isFinite(node._currentScale)
      ? node._currentScale
      : node._baseScale;
    tempColor.setHSL(h, s, l);
    opaqueNodeMesh.setColorAt(i, tempColor);
    transparentNodeMesh.setColorAt(i, tempColor);
    setNodeColorState(i, h, s, l, 1);
    setNodeScaleState(i, scale);

    dummy.position.set(node.x, node.y, node.z);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    opaqueNodeMesh.setMatrixAt(i, dummy.matrix);
    transparentNodeMesh.setMatrixAt(i, dummy.matrix);
  }

  opaqueNodeMesh.instanceColor.needsUpdate = true;
  opaqueNodeMesh.instanceMatrix.needsUpdate = true;
  opaqueNodeMesh.geometry.attributes.instanceOpacity.needsUpdate = true;
  opaqueNodeMesh.renderOrder = 2;

  transparentNodeMesh.instanceColor.needsUpdate = true;
  transparentNodeMesh.instanceMatrix.needsUpdate = true;
  transparentNodeMesh.geometry.attributes.instanceOpacity.needsUpdate = true;
  transparentNodeMesh.renderOrder = 3;

  scene.add(opaqueNodeMesh);
  scene.add(transparentNodeMesh);
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
  edgePositions = new Float32Array(edgeList.length * getEdgeCurveSegments() * 6);
  fillEdgePositions(edgeList, edgePositions);
  const geo = new LineSegmentsGeometry();
  geo.setPositions(edgePositions);

  edgeMat = new LineMaterial({
    color: 0x48505b,
    linewidth: EDGE_LINE_WIDTH,
    transparent: true,
    opacity: 0.18,
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
  const segmentCount = getEdgeCurveSegments();
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
    for (let seg = 1; seg <= segmentCount; seg++) {
      const t = seg / segmentCount;
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
  const expectedLength = list.length * getEdgeCurveSegments() * 6;
  if (arr.length !== expectedLength) {
    const nextPositions = new Float32Array(expectedLength);
    fillEdgePositions(list, nextPositions);
    const previousGeometry = lineMesh.geometry;
    const nextGeometry = new LineSegmentsGeometry();
    nextGeometry.setPositions(nextPositions);
    lineMesh.geometry = nextGeometry;
    previousGeometry.dispose();
    return nextPositions;
  }

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
    return arr;
  }

  geometry.setPositions(arr);
  return arr;
}

function makeArrowGeometry(radius, height) {
  const geo = new THREE.ConeGeometry(radius, height, 3);
  // Shift so the tip (apex) is at local origin — body extends down -Y
  geo.translate(0, -height / 2, 0);
  return geo;
}

function hideArrowInstance(arrowMesh, instanceIdx) {
  dummy.scale.setScalar(0);
  dummy.position.set(0, 0, 0);
  dummy.updateMatrix();
  arrowMesh.setMatrixAt(instanceIdx, dummy.matrix);
}

function shouldShowHighlightedArrowheads() {
  return edgeDirectionVisible && !videoRenderMode && !animationPerformanceMode;
}

function syncHighlightedArrowVisibility() {
  for (const layer of highlightLayers) {
    if (layer.arrows) {
      layer.arrows.visible = shouldShowHighlightedArrowheads();
    }
  }
}

function forEachEdgeLayer(visitor) {
  visitor({
    lines: edgeLines,
    edgeList,
    positions: edgePositions,
    arrows: edgeArrows,
  });
  for (const layer of highlightLayers) {
    visitor(layer);
  }
}

function updateEdgeLayer(layer, { updateEdges, updateArrows }) {
  if (updateEdges && layer.lines && layer.edgeList && layer.positions) {
    layer.positions = updateLinePositions(layer.lines, layer.edgeList, layer.positions);
  }

  if (layer.arrows && layer.edgeList) {
    if (updateArrows && !animationPerformanceMode && !videoRenderMode) {
      positionArrows(layer.arrows, layer.edgeList);
    } else {
      deferredArrowRefresh = true;
    }
  }
}

function buildEdgeArrows() {
  if (edgeArrows) {
    scene.remove(edgeArrows);
    edgeArrows.geometry.dispose();
    edgeArrows.material.dispose();
  }

  // Base graph edges stay arrow-free; only highlighted edges render direction markers.
  edgeArrows = null;
}

function positionArrows(arrowMesh, list) {
  let instanceIdx = 0;
  for (let i = 0; i < list.length; i++) {
    const edge = list[i];
    const len = computeCurveFrame(edge, curveSource, curveControl, curveTarget);

    for (let a = 0; a < ARROWS_PER_EDGE; a++) {
      if (len < 0.001) {
        hideArrowInstance(arrowMesh, instanceIdx++);
        continue;
      }

      const t =
        ARROW_T_START +
        (a / (ARROWS_PER_EDGE - 1)) * (ARROW_T_END - ARROW_T_START);
      evaluateQuadraticPoint(
        t,
        curveSource,
        curveControl,
        curveTarget,
        arrowPos,
      );
      evaluateQuadraticTangent(
        t,
        curveSource,
        curveControl,
        curveTarget,
        arrowDir,
      );
      const arrowDirLength = arrowDir.length();
      if (arrowDirLength < 0.001) {
        hideArrowInstance(arrowMesh, instanceIdx++);
        continue;
      }
      arrowDir.divideScalar(arrowDirLength);

      dummy.position.copy(arrowPos);
      // Orient cone so +Y (tip direction) follows edge flow
      dummy.quaternion.setFromUnitVectors(upVec, arrowDir);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      arrowMesh.setMatrixAt(instanceIdx++, dummy.matrix);
    }
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
  };
}

// --- Position / visual updates ---

export function updateNodeTransforms(options = {}) {
  if (!hasNodeMeshes() || !nodes) return;

  const now = performance.now();
  advanceVisualTransitions(now, { applyColors: false, applyTransforms: false });

  const animateScale = options.animateScale ?? true;
  const transitionDuration = options.transitionDurationMs ?? NODE_SCALE_TRANSITION_DURATION_MS;
  let hasScaleTargetChange = false;

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const targetScale = Number.isFinite(n._currentScale) ? n._currentScale : n._baseScale;

    if (animateScale) {
      if (hasMeaningfulDelta(nodeScaleTargetArray[i], targetScale)) {
        nodeScaleTargetArray[i] = targetScale;
        hasScaleTargetChange = true;
      }
    } else {
      nodeScaleCurrentArray[i] = targetScale;
      nodeScaleTargetArray[i] = targetScale;
      nodeScaleStartArray[i] = targetScale;
    }
  }

  if (animateScale && hasScaleTargetChange) {
    beginScaleTransition(now, transitionDuration);
  } else if (!animateScale) {
    activeScaleTransition = null;
  }

  applyNodeTransformStateToMesh();
}

export function updatePositions(options = {}) {
  const updateArrows = options.updateArrows ?? !animationPerformanceMode;
  const updateEdges = options.updateEdges ?? true;
  updateNodeTransforms({
    animateScale: options.animateScale,
    transitionDurationMs: options.transitionDurationMs,
  });

  forEachEdgeLayer((layer) => {
    updateEdgeLayer(layer, { updateEdges, updateArrows });
  });
}

export function updateColors(colorMap, options = {}) {
  if (!hasNodeMeshes()) return;
  const now = performance.now();
  advanceVisualTransitions(now, { applyColors: false, applyTransforms: false });

  const animate = options.animate ?? true;
  const transitionDuration = options.transitionDurationMs ?? NODE_COLOR_TRANSITION_DURATION_MS;
  let hasColorTargetChange = false;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const c = colorMap ? colorMap.get(node.id) : null;
    const alpha = c && typeof c.a === "number" ? c.a : 1;
    let nextH = 0;
    let nextS = 0;
    let nextL = 0;
    if (c) {
      nextH = c.h;
      nextS = c.s;
      nextL = c.l;
    } else {
      const def = getCategoryColor(node.category);
      nextH = def.h;
      nextS = def.s;
      nextL = def.l;
    }

    const colorOffset = i * 3;
    if (animate) {
      if (hasMeaningfulDelta(nodeColorTargetArray[colorOffset], nextH)) {
        nodeColorTargetArray[colorOffset] = nextH;
        hasColorTargetChange = true;
      }
      if (hasMeaningfulDelta(nodeColorTargetArray[colorOffset + 1], nextS)) {
        nodeColorTargetArray[colorOffset + 1] = nextS;
        hasColorTargetChange = true;
      }
      if (hasMeaningfulDelta(nodeColorTargetArray[colorOffset + 2], nextL)) {
        nodeColorTargetArray[colorOffset + 2] = nextL;
        hasColorTargetChange = true;
      }
      if (hasMeaningfulDelta(nodeAlphaTargetArray[i], alpha)) {
        nodeAlphaTargetArray[i] = alpha;
        hasColorTargetChange = true;
      }
    } else {
      nodeColorCurrentArray[colorOffset] = nextH;
      nodeColorCurrentArray[colorOffset + 1] = nextS;
      nodeColorCurrentArray[colorOffset + 2] = nextL;
      nodeColorTargetArray[colorOffset] = nextH;
      nodeColorTargetArray[colorOffset + 1] = nextS;
      nodeColorTargetArray[colorOffset + 2] = nextL;
      nodeColorStartArray[colorOffset] = nextH;
      nodeColorStartArray[colorOffset + 1] = nextS;
      nodeColorStartArray[colorOffset + 2] = nextL;
      nodeAlphaCurrentArray[i] = alpha;
      nodeAlphaTargetArray[i] = alpha;
      nodeAlphaStartArray[i] = alpha;
    }
  }

  if (animate && hasColorTargetChange) {
    beginColorTransition(now, transitionDuration);
  } else if (!animate) {
    activeColorTransition = null;
  }

  if (!animate) {
    applyNodeColorStateToMesh();
  }
}

export function setEdgeOpacity(opacity) {
  if (edgeMat) edgeMat.opacity = opacity;
  if (edgeLines) edgeLines.visible = opacity > 0.001;
}

export function setEdgeDirectionVisible(enabled) {
  edgeDirectionVisible = Boolean(enabled);
  syncHighlightedArrowVisibility();
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
  const positions = new Float32Array(pairs.length * getEdgeCurveSegments() * 6);
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

  if (!SHOW_EDGE_ARROWS) {
    return {
      edgeList: pairs,
      positions,
      lines,
      arrows: null,
      lineMaterial,
    };
  }

  // Highlight arrowheads (slightly larger)
  const hlRadius = ARROW_RADIUS * 1.4;
  const hlHeight = ARROW_HEIGHT * 1.4;
  const coneGeo = makeArrowGeometry(hlRadius, hlHeight);

  const coneMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(colorHex),
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });

  const totalArrows = pairs.length * ARROWS_PER_EDGE;
  const arrows = new THREE.InstancedMesh(coneGeo, coneMat, totalArrows);
  arrows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  arrows.renderOrder = 1;
  positionArrows(arrows, pairs);
  arrows.visible = shouldShowHighlightedArrowheads();
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

  forEachEdgeLayer((layer) => {
    if (layer.arrows) {
      layer.arrows.visible = shouldShowHighlightedArrowheads();
    }
  });

  if (!animationPerformanceMode && deferredArrowRefresh) {
    deferredArrowRefresh = false;
    forEachEdgeLayer((layer) => {
      if (layer.arrows && layer.edgeList) {
        positionArrows(layer.arrows, layer.edgeList);
      }
    });
  }

  if (renderer) onResize();
}

// --- Raycasting ---

export function getNodeAtScreen(mx, my) {
  if (!hasNodeMeshes()) return null;
  mouseVec.set(mx, my);
  raycaster.setFromCamera(mouseVec, camera);
  const hits = [
    ...raycaster.intersectObject(opaqueNodeMesh),
    ...raycaster.intersectObject(transparentNodeMesh),
  ].sort((a, b) => a.distance - b.distance);

  for (const hit of hits) {
    const instanceId = hit.instanceId;
    if (instanceId == null) continue;
    const alpha = nodeAlphaCurrentArray?.[instanceId] ?? 1;
    if (alpha <= HIDDEN_NODE_ALPHA_EPSILON) continue;
    const belongsToOpaquePass = alpha >= OPAQUE_NODE_ALPHA_CUTOFF;
    if (hit.object === opaqueNodeMesh && belongsToOpaquePass) {
      return nodes[instanceId].id;
    }
    if (hit.object === transparentNodeMesh && !belongsToOpaquePass) {
      return nodes[instanceId].id;
    }
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

export function setVideoRenderMode(enabled) {
  const nextMode = Boolean(enabled);
  if (videoRenderMode === nextMode) return;
  videoRenderMode = nextMode;

  forEachNodeMesh((mesh) => {
    const previousGeometry = mesh.geometry;
    mesh.geometry = getNodeGeometryForCurrentMode();
    previousGeometry.dispose();
    mesh.geometry.attributes.instanceOpacity.needsUpdate = true;
  });

  forEachEdgeLayer((layer) => {
    if (layer.lines && layer.edgeList && layer.positions) {
      layer.positions = updateLinePositions(layer.lines, layer.edgeList, layer.positions);
    }
    if (layer.arrows) {
      layer.arrows.visible = shouldShowHighlightedArrowheads();
    }
  });

  if (renderer) {
    onResize();
  }
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
  advanceVisualTransitions(performance.now());
  if (controls && updateControls) {
    controls.update();
  }
  renderer.render(scene, camera);
  if (postRenderCallback) {
    postRenderCallback();
  }
}

export function setRenderLoopPaused(paused) {
  renderLoopPaused = Boolean(paused);
}

export function setPostRenderCallback(callback) {
  postRenderCallback = typeof callback === 'function' ? callback : null;
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

export async function captureVideoFrame(options = {}) {
  const {
    render = true,
    mimeType = "image/png",
    quality,
  } = options;

  if (render) {
    renderFrame({ updateControls: false });
  }
  return encodeCanvasToDataUrl(renderer.domElement, mimeType, quality);
}

export function captureScreenshot(options = {}) {
  const {
    render = true,
    mimeType = "image/png",
    quality,
  } = options;

  if (render) {
    // Render one frame with preserveDrawingBuffer behavior.
    renderFrame({ updateControls: false });
  }
  const sourceCanvas = renderer.domElement;
  const targetCanvas = getScreenshotCanvas(sourceCanvas.width, sourceCanvas.height);
  screenshotContext.drawImage(sourceCanvas, 0, 0, targetCanvas.width, targetCanvas.height);

  return targetCanvas.toDataURL(mimeType, quality);
}

export function getContainer() {
  return container;
}
