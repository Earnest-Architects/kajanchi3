/**
 * ============================================================
 *  mini3d.js — jendela "Mini 3D" (icon-rail kiri-bawah)
 * ============================================================
 * Nampilin model 3D.glb pakai Three.js di dalam window mini yang
 * bisa di-resize manual (mirip pola resize floorplan.js), dengan:
 *   1) Orbit + pan + zoom (OrbitControls)
 *   2) Section/potongan dari sumbu X, Y, Z — tiap sumbu punya
 *      2 bidang potong yang menggerus dari luar ke dalam, masing2
 *      dikontrol lewat 1 dual-handle slider (gagang bawah = bidang
 *      dari sisi luar minus, gagang atas = bidang dari sisi luar plus).
 * Model & clipping plane baru dibuat/di-load sekali (lazy) saat
 * user pertama kali membuka panelnya, biar tidak makan resource
 * kalau fitur ini tidak dipakai.
 * ============================================================
 */
import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { GLTFLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";

const MODEL_URL = "assets/3D.glb";
const PANEL_SIZE_KEY = "luma-mini3d-panel-size";
const DEFAULT_PANEL_WIDTH = 300;
const DEFAULT_PANEL_HEIGHT = 360;
const PANEL_MIN_WIDTH = 240;
const PANEL_MIN_HEIGHT = 280;

/* ---------- DOM refs ---------- */

const panel = document.getElementById("mini3d-panel");
const showBtn = document.getElementById("mini3d-show-btn");
const hideBtn = document.getElementById("mini3d-hide-btn");
const viewport = document.getElementById("mini3d-viewport");
const canvas = document.getElementById("mini3d-canvas");
const loadingEl = document.getElementById("mini3d-loading");
const resizeHandle = document.getElementById("mini3d-resize-handle");
const resetBtn = document.getElementById("mini3d-reset-btn");
const sectionsEl = document.getElementById("mini3d-sections");

const sliders = {
  xMin: document.getElementById("mini3d-x-min"),
  xMax: document.getElementById("mini3d-x-max"),
  yMin: document.getElementById("mini3d-y-min"),
  yMax: document.getElementById("mini3d-y-max"),
  zMin: document.getElementById("mini3d-z-min"),
  zMax: document.getElementById("mini3d-z-max"),
};

if (!panel || !showBtn || !canvas) {
  // Markup mini3d tidak ada di halaman ini (mis. vr.html) — skip diam2.
  throw new Error("__mini3d_skip__");
}

/* ---------- State three.js (dibuat lazy saat panel pertama dibuka) ---------- */

let renderer = null;
let scene = null;
let camera = null;
let controls = null;
let modelRoot = null;
let clippingPlanes = null; // { xMin, xMax, yMin, yMax, zMin, zMax } -> THREE.Plane
let modelBox = null; // THREE.Box3 asli model (sebelum di-center)
let animId = null;
let resizeObserver = null;
let initStarted = false;
let renderLoopActive = false;

function initThree() {
  if (initStarted) return;
  initStarted = true;

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
  camera.position.set(2.4, 1.8, 2.6);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.localClippingEnabled = true;

  const hemi = new THREE.HemisphereLight(0xdfe8f5, 0x1a1f2b, 1.15);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1.4);
  dir.position.set(4, 6, 3);
  scene.add(dir);
  const dir2 = new THREE.DirectionalLight(0xbcd0ee, 0.5);
  dir2.position.set(-4, -2, -3);
  scene.add(dir2);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.enableZoom = true;
  controls.screenSpacePanning = true;
  controls.minDistance = 0.05;
  controls.maxDistance = 500;

  // 6 bidang potong (2 per sumbu). Normal & constant awal diisi ulang
  // setelah bounding box model diketahui, lewat resetSectionPlanes().
  clippingPlanes = {
    xMin: new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
    xMax: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),
    yMin: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    yMax: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
    zMin: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
    zMax: new THREE.Plane(new THREE.Vector3(0, 0, -1), 0),
  };
  const planeList = Object.values(clippingPlanes);

  new GLTFLoader().load(
    MODEL_URL,
    (gltf) => {
      modelRoot = gltf.scene;

      // Center-kan model ke origin (0,0,0) biar orbit target pas di tengah.
      const rawBox = new THREE.Box3().setFromObject(modelRoot);
      const center = rawBox.getCenter(new THREE.Vector3());
      modelRoot.position.sub(center);

      modelRoot.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = false;
        child.receiveShadow = false;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((mat) => {
          if (!mat) return;
          // Dua sisi diaktifkan supaya waktu di-section, bagian dalam yang
          // "terbuka" tetap kelihatan permukaannya — simple, tanpa cap solid.
          mat.side = THREE.DoubleSide;
          mat.clippingPlanes = planeList;
          mat.clipShadows = false;
          mat.needsUpdate = true;
        });
      });

      scene.add(modelRoot);
      modelBox = new THREE.Box3().setFromObject(modelRoot);

      frameCameraToBox(modelBox);
      resetSectionPlanes();
      sectionsEl.classList.remove("mini3d-sections-disabled");
      Object.values(sliders).forEach((s) => (s.disabled = false));

      loadingEl.classList.add("hidden");
    },
    undefined,
    (err) => {
      loadingEl.textContent = "Gagal memuat model 3D.";
      console.error("[mini3d] gagal load", MODEL_URL, err);
    }
  );

  Object.values(sliders).forEach((s) => (s.disabled = true));
  sectionsEl.classList.add("mini3d-sections-disabled");

  bindSliderEvents();
  bindResizeHandle();
  resizeObserver = new ResizeObserver(onViewportResize);
  resizeObserver.observe(viewport);
  onViewportResize();
}

function frameCameraToBox(box) {
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.01);
  const dist = maxDim * 1.8;
  camera.position.set(dist * 0.7, dist * 0.55, dist * 0.7);
  camera.near = maxDim / 200;
  camera.far = maxDim * 50;
  camera.updateProjectionMatrix();
  controls.target.set(0, 0, 0);
  controls.update();
}

/* ---------- Section (clipping) X/Y/Z ----------
 * Model sudah di-center ke origin, jadi bounding box dipakai relatif
 * ke origin: half-extent = size/2. t = 0..1 dari slider.
 *   - plane "min" (gagang bawah): visible saat pos >= min + t*(max-min)
 *     -> menggerus dari sisi luar NEGATIF ke dalam waktu t naik dari 0.
 *   - plane "max" (gagang atas): visible saat pos <= min + t*(max-min)
 *     -> menggerus dari sisi luar POSITIF ke dalam waktu t turun dari 1.
 */
function axisRange(axis) {
  const half = modelBox.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const h = axis === "x" ? half.x : axis === "y" ? half.y : half.z;
  return { min: -h, max: h };
}

function applyPlane(axis, kind, t) {
  const { min, max } = axisRange(axis);
  const threshold = min + t * (max - min);
  const plane = clippingPlanes[axis + (kind === "min" ? "Min" : "Max")];
  if (kind === "min") {
    // normal (+axis): visible where axisVal + constant >= 0 -> axisVal >= -constant
    plane.constant = -threshold;
  } else {
    // normal (-axis): visible where -axisVal + constant >= 0 -> axisVal <= constant
    plane.constant = threshold;
  }
}

function resetSectionPlanes() {
  sliders.xMin.value = "0";
  sliders.xMax.value = "1";
  sliders.yMin.value = "0";
  sliders.yMax.value = "1";
  sliders.zMin.value = "0";
  sliders.zMax.value = "1";
  ["x", "y", "z"].forEach((axis) => {
    applyPlane(axis, "min", 0);
    applyPlane(axis, "max", 1);
  });
}

function bindSliderEvents() {
  const pairs = [
    ["x", sliders.xMin, sliders.xMax],
    ["y", sliders.yMin, sliders.yMax],
    ["z", sliders.zMin, sliders.zMax],
  ];
  pairs.forEach(([axis, minInput, maxInput]) => {
    minInput.addEventListener("input", () => {
      // Gagang "min" tidak boleh lewatin gagang "max" (jaga urutan dual-slider).
      if (parseFloat(minInput.value) > parseFloat(maxInput.value)) {
        minInput.value = maxInput.value;
      }
      if (modelBox) applyPlane(axis, "min", parseFloat(minInput.value));
    });
    maxInput.addEventListener("input", () => {
      if (parseFloat(maxInput.value) < parseFloat(minInput.value)) {
        maxInput.value = minInput.value;
      }
      if (modelBox) applyPlane(axis, "max", parseFloat(maxInput.value));
    });
  });

  resetBtn.addEventListener("click", () => {
    if (modelBox) resetSectionPlanes();
  });
}

/* ---------- Render loop (jalan hanya waktu panel terbuka) ---------- */

function renderFrame() {
  if (!renderLoopActive) return;
  controls.update();
  renderer.render(scene, camera);
  animId = requestAnimationFrame(renderFrame);
}

function startRenderLoop() {
  if (renderLoopActive) return;
  renderLoopActive = true;
  onViewportResize();
  animId = requestAnimationFrame(renderFrame);
}

function stopRenderLoop() {
  renderLoopActive = false;
  if (animId) cancelAnimationFrame(animId);
  animId = null;
}

function onViewportResize() {
  if (!renderer || !camera) return;
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  if (w < 2 || h < 2) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

/* ---------- Show / hide panel ---------- */

showBtn.addEventListener("click", () => {
  panel.classList.remove("hidden");
  showBtn.classList.remove("visible");
  initThree();
  startRenderLoop();
});
hideBtn.addEventListener("click", () => {
  panel.classList.add("hidden");
  showBtn.classList.add("visible");
  stopRenderLoop();
});

/* ---------- Resize window panel (manual scale, mirip floorplan.js) ----------
 * Panel ini nge-anchor di sudut KIRI-BAWAH (left & bottom fixed di CSS),
 * jadi membesar = tumbuh ke KANAN-ATAS. Handle-nya diletakkan di sudut
 * kanan-atas: drag menjauh (kanan-atas) = membesar, drag mendekat = mengecil.
 */
function panelMaxWidth() {
  // Selaras dengan CSS .floorplan-panel { max-width: min(92vw, 560px) }
  return Math.min(window.innerWidth * 0.92, 560);
}
function panelMaxHeight() {
  // Selaras dengan CSS .floorplan-panel { max-height: min(80vh, 720px) }
  return Math.min(window.innerHeight * 0.8, 720);
}
function setPanelSize(width, height) {
  const w = Math.min(panelMaxWidth(), Math.max(PANEL_MIN_WIDTH, width));
  const h = Math.min(panelMaxHeight(), Math.max(PANEL_MIN_HEIGHT, height));
  panel.style.width = w + "px";
  panel.style.height = h + "px";
  onViewportResize();
}
function savePanelSize() {
  try {
    localStorage.setItem(PANEL_SIZE_KEY, JSON.stringify({ w: panel.offsetWidth, h: panel.offsetHeight }));
  } catch (_) {
    /* localStorage tidak tersedia — abaikan */
  }
}
function restorePanelSize() {
  try {
    const raw = localStorage.getItem(PANEL_SIZE_KEY);
    if (!raw) return;
    const { w, h } = JSON.parse(raw);
    if (w && h) setPanelSize(w, h);
  } catch (_) {
    /* data korup — pakai default dari CSS */
  }
}

function bindResizeHandle() {
  let resizing = false;
  let startX = 0;
  let startY = 0;
  let startWidth = 0;
  let startHeight = 0;

  resizeHandle.addEventListener("pointerdown", (e) => {
    resizing = true;
    const rect = panel.getBoundingClientRect();
    startWidth = rect.width;
    startHeight = rect.height;
    startX = e.clientX;
    startY = e.clientY;
    panel.classList.add("resizing");
    resizeHandle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  resizeHandle.addEventListener("pointermove", (e) => {
    if (!resizing) return;
    const dx = e.clientX - startX; // drag ke kanan -> lebar bertambah
    const dy = startY - e.clientY; // drag ke atas -> tinggi bertambah
    setPanelSize(startWidth + dx, startHeight + dy);
  });
  ["pointerup", "pointercancel"].forEach((evt) => {
    resizeHandle.addEventListener(evt, () => {
      if (!resizing) return;
      resizing = false;
      panel.classList.remove("resizing");
      savePanelSize();
    });
  });
  resizeHandle.addEventListener("dblclick", () => {
    setPanelSize(DEFAULT_PANEL_WIDTH, DEFAULT_PANEL_HEIGHT);
    savePanelSize();
  });
  window.addEventListener("resize", () => {
    setPanelSize(panel.offsetWidth, panel.offsetHeight);
  });

  restorePanelSize();
}
