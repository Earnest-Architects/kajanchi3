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
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import { mini3dModel } from "./content.js";

/* ---------- On/off fitur ----------
 * Dikontrol PENUH lewat `mini3dModel` di content.js:
 *   - diisi nama file (mis. "3D.glb")           -> fitur aktif.
 *   - dikosongkan ("" atau "#")                  -> fitur nonaktif.
 * Titik "#" sengaja dianggap "kosong" juga, supaya orang yang biasa
 * pakai "#" sebagai placeholder link tetap dapat efek nonaktif. */
const MINI3D_ENABLED = !!mini3dModel && mini3dModel.trim() !== "" && mini3dModel.trim() !== "#";
const MODEL_URL = `assets/${mini3dModel}`;

/* ---------- Optimasi performa ----------
 * MERGE_STATIC_MESHES : gabungkan mesh yang materialnya sama jadi satu
 *   (ribuan draw call -> jauh lebih sedikit). Set false kalau ada yang aneh.
 * ADAPTIVE_PIXEL_RATIO: waktu model diputar/di-zoom, resolusi render
 *   diturunkan sementara ke MOVING_PIXEL_RATIO, lalu kembali tajam
 *   begitu berhenti. Cuma berpengaruh di layar retina (DPR > 1). */
const MERGE_STATIC_MESHES = true;
const ADAPTIVE_PIXEL_RATIO = true;
const MOVING_PIXEL_RATIO = 1;
const PANEL_SIZE_KEY = "luma-mini3d-panel-size";
const DEFAULT_PANEL_WIDTH = 300;
const DEFAULT_PANEL_HEIGHT = 360;
const PANEL_MIN_WIDTH = 240;
const PANEL_MIN_HEIGHT = 280;

/* ---------- DOM refs ---------- */

const panel = document.getElementById("mini3d-panel");
const showBtn = document.getElementById("mini3d-show-btn");
const fullscreenBtn = document.getElementById("mini3d-fullscreen-btn");
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

if (!MINI3D_ENABLED) {
  // mini3dModel dikosongkan ("" / "#") di content.js -> fitur dimatikan
  // total: icon "3D" & panelnya disembunyikan, tidak ada listener yang
  // dipasang, dan model TIDAK pernah di-fetch/di-load sama sekali.
  showBtn.remove();
  panel.remove();
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
let initialCameraPos = null; // posisi kamera awal, dipakai tombol Reset
let initialTarget = null; // target orbit awal, dipakai tombol Reset
let animId = null;
let resizeObserver = null;
let initStarted = false;
let renderLoopActive = false;
let shadowLight = null; // directional light yang cast shadow, dikonfigurasi ulang sesuai ukuran model
const _tmpSize = new THREE.Vector3(); // vektor reusable buat renderFrame
let groundShadow = null; // plane transparan di bawah model, cuma buat nangkep bayangan

/* ---------- Cap hitam di potongan (section) — irisan geometri langsung ----------
 * Versi sebelumnya (teknik stencil-parity ala "cap holes in clipped
 * geometry") mengharuskan SELURUH model jadi satu solid yang benar2
 * tertutup rapat (watertight). Itu TIDAK cocok buat model arsitektur
 * seperti ini: dinding yang ada lubang jendela/pintu itu MEMANG secara
 * topologi "terbuka" (ada tepi tanpa pasangan di sekeliling lubangnya)
 * — bukan cacat model. Begitu satu mesh besar (mis. seluruh cangkang
 * bangunan) punya satu saja bukaan begitu, tes "tertutup" gagal untuk
 * SELURUH mesh itu, dan (kalau dipaksa tetap ikut) parity-nya malah
 * rusak untuk SELURUH layar. Itu sebabnya sebelumnya jadi "sama sekali
 * tidak hitam" (mesh ditolak semua) atau "hitam semua" (dipaksa ikut).
 *
 * Pendekatan baru di sini SAMA SEKALI TIDAK butuh mesh tertutup.
 * Untuk tiap bidang potong yang aktif:
 *   1) Iris LANGSUNG semua segitiga model dengan bidang itu (seperti
 *      "marching triangles" 2D) -> tiap segitiga yang ditembus bidang
 *      menyumbang 1 ruas garis potongannya.
 *   2) Sambung ruas-ruas itu lewat titik ujung yang berhimpit. Rantai
 *      yang BALIK ke titik awal = loop tertutup -> itu memang bagian
 *      solid yang benar2 kepotong -> DIISI hitam. Rantai yang mentok
 *      (tidak balik) berarti di situ mesh-nya memang terbuka (tembus
 *      lubang jendela/pintu/tepi model) -> DIBIARKAN terbuka, dan itu
 *      memang benar secara fisik.
 *   3) Tiap loop tertutup digambar ke stencil buffer sebagai kipas
 *      segitiga dari satu titik acuan bersama, pakai stencil op INVERT
 *      (aturan genap-ganjil) — otomatis benar juga untuk bentuk cekung
 *      dan untuk lubang-di-dalam-lubang, tanpa perlu logika nesting
 *      manual. Baru sebuah bidang hitam ditempel persis di bidang
 *      potong, cuma digambar di piksel yang stencil-nya != 0.
 * Hasilnya: SELALU lokal ke apa yang benar2 kepotong, tidak pernah
 * "bocor" ke seluruh layar walau model punya bagian terbuka di tempat
 * lain — dan tidak perlu tebak-tebakan toleransi/watertight sama sekali.
 */
const CAP_COLOR = 0x000000;
// Toleransi penyatuan titik potong (relatif ke ukuran model) buat
// menyambung ruas-ruas potongan jadi loop. Titik potongnya hasil
// interpolasi (bukan vertex asli), jadi sedikit lebih longgar dari
// toleransi vertex biasa supaya galat pembulatan kecil tidak bikin
// loop gagal nyambung.
const CAP_LOOP_WELD_TOLERANCE = 1e-4;
const MODEL_RENDER_ORDER = 100; // model digambar SETELAH stencil + cap

let capGroups = null; // { xMin: { group, cap, fan }, ... }
let capPlaneSize = 1;
let capSource = null; // { pos, idx, triCount } — semua segitiga model (world space), dikumpulin sekali saat load
let capLoopEps = 1e-4; // eps weld absolut (sudah dikali ukuran model), diisi di buildSectionCaps
let capDirty = new Set(); // key bidang yang geometri potongannya perlu dihitung ulang frame berikutnya

// Kumpulkan SEMUA segitiga model (world space) jadi satu buffer besar.
// Tidak ada tes "tertutup" di sini sama sekali — lihat penjelasan di atas.
function buildCapSource(root) {
  root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  const parts = [];
  root.traverse((mesh) => {
    if (!mesh.isMesh || mesh.isSkinnedMesh || mesh.isInstancedMesh || !mesh.visible) return;
    const geo = mesh.geometry;
    const posAttr = geo && geo.attributes && geo.attributes.position;
    if (!posAttr) return;
    const n = posAttr.count;
    const world = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(posAttr, i).applyMatrix4(mesh.matrixWorld);
      world[i * 3] = v.x;
      world[i * 3 + 1] = v.y;
      world[i * 3 + 2] = v.z;
    }
    const triCount = Math.floor((geo.index ? geo.index.count : n) / 3);
    const idx = new Uint32Array(triCount * 3);
    if (geo.index) idx.set(geo.index.array.subarray(0, triCount * 3));
    else for (let i = 0; i < idx.length; i++) idx[i] = i;
    parts.push({ world, idx });
  });

  let vLen = 0;
  let iLen = 0;
  parts.forEach((p) => {
    vLen += p.world.length;
    iLen += p.idx.length;
  });
  const pos = new Float32Array(vLen);
  const idx = new Uint32Array(iLen);
  let vo = 0;
  let io = 0;
  let vOff = 0;
  parts.forEach((p) => {
    pos.set(p.world, vo);
    for (let i = 0; i < p.idx.length; i++) idx[io + i] = p.idx[i] + vOff;
    vo += p.world.length;
    io += p.idx.length;
    vOff += p.world.length / 3;
  });
  return { pos, idx, triCount: idx.length / 3 };
}

// Potong SATU polygon (array THREE.Vector3, berurutan) dengan SATU
// bidang (Sutherland–Hodgman). Sisi yang disimpan = sisi "visible"
// bidang itu (distanceToPoint >= 0), sama seperti konvensi clipping
// three.js — dipakai buat membatasi cap supaya tidak melebihi kotak
// potongan waktu ada lebih dari 1 bidang aktif sekaligus.
function clipPolygonByPlane(points, plane) {
  if (!points.length) return points;
  const out = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const cur = points[i];
    const nxt = points[(i + 1) % n];
    const dCur = plane.distanceToPoint(cur);
    const dNxt = plane.distanceToPoint(nxt);
    const curIn = dCur >= 0;
    const nxtIn = dNxt >= 0;
    if (curIn) out.push(cur);
    if (curIn !== nxtIn) out.push(cur.clone().lerp(nxt, dCur / (dCur - dNxt)));
  }
  return out;
}

// Jitter kecil & stabil (berbasis index segitiga) biar jarak ke bidang
// nyaris tidak pernah PERSIS 0 — menghindari kasus khusus "vertex pas
// nempel di bidang". Besarnya jauh di bawah eps jadi tidak mengubah
// bentuk potongan.
function stableJitter(i) {
  return (((i * 2654435761) >>> 0) % 1000) / 1000 - 0.5;
}

// Cari semua loop TERTUTUP hasil irisan segitiga model dengan `plane`.
function intersectPlaneLoops(pos, idx, plane, eps) {
  const segments = [];
  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    const ia = idx[t] * 3, ib = idx[t + 1] * 3, ic = idx[t + 2] * 3;
    p0.set(pos[ia], pos[ia + 1], pos[ia + 2]);
    p1.set(pos[ib], pos[ib + 1], pos[ib + 2]);
    p2.set(pos[ic], pos[ic + 1], pos[ic + 2]);
    const d0 = plane.distanceToPoint(p0) + stableJitter(t) * eps * 1e-2;
    const d1 = plane.distanceToPoint(p1) + stableJitter(t + 1) * eps * 1e-2;
    const d2 = plane.distanceToPoint(p2) + stableJitter(t + 2) * eps * 1e-2;
    const s0 = d0 >= 0, s1 = d1 >= 0, s2 = d2 >= 0;
    if (s0 === s1 && s1 === s2) continue; // segitiga tidak ditembus bidang

    const pts = [];
    const edge = (pa, da, pb, db) => {
      if ((da >= 0) === (db >= 0)) return;
      pts.push(pa.clone().lerp(pb, da / (da - db)));
    };
    edge(p0, d0, p1, d1);
    edge(p1, d1, p2, d2);
    edge(p2, d2, p0, d0);
    if (pts.length === 2) segments.push(pts);
  }
  if (!segments.length) return [];

  // Sambung ruas-ruas lewat weld titik ujung (hash grid posisi).
  const nodeMap = new Map();
  const nodePos = [];
  const nodeId = (p) => {
    const k = Math.round(p.x / eps) + "," + Math.round(p.y / eps) + "," + Math.round(p.z / eps);
    let id = nodeMap.get(k);
    if (id === undefined) {
      id = nodePos.length;
      nodeMap.set(k, id);
      nodePos.push(p);
    }
    return id;
  };
  const adj = [];
  const segNodes = segments.map(([p, q]) => [nodeId(p), nodeId(q)]);
  segNodes.forEach(([a, b], i) => {
    if (a === b) return; // ruas degenerate (kedua ujung ke-weld ke titik yang sama) — abaikan
    (adj[a] || (adj[a] = [])).push({ other: b, seg: i });
    (adj[b] || (adj[b] = [])).push({ other: a, seg: i });
  });

  const used = new Array(segNodes.length).fill(false);
  const loops = [];
  for (let i = 0; i < segNodes.length; i++) {
    const [a, b] = segNodes[i];
    if (used[i] || a === b) continue;
    const start = a;
    let cur = b;
    used[i] = true;
    const chain = [start, cur];
    let closed = false;
    let guard = 0;
    while (guard++ < segNodes.length + 5) {
      const options = (adj[cur] || []).filter((e) => !used[e.seg]);
      if (!options.length) break; // mentok -> tepi terbuka (mis. lubang jendela/pintu), buang rantai ini
      const opt = options[0];
      used[opt.seg] = true;
      cur = opt.other;
      if (cur === start) {
        closed = true;
        break;
      }
      chain.push(cur);
    }
    if (closed && chain.length >= 3) loops.push(chain.map((id) => nodePos[id]));
  }
  return loops;
}

// Bikin geometri "kipas" (fan) dari satu titik acuan bersama ke tiap
// sisi tiap loop. Dirender pakai stencil op INVERT (genap-ganjil) —
// otomatis benar untuk bentuk cekung & lubang-di-dalam-lubang, tidak
// perlu tahu mana loop "luar" mana yang "lubang".
function buildFanGeometry(loops) {
  if (!loops.length) return new THREE.BufferGeometry();
  let sx = 0, sy = 0, sz = 0, n = 0;
  loops.forEach((loop) =>
    loop.forEach((p) => {
      sx += p.x; sy += p.y; sz += p.z; n += 1;
    })
  );
  const ax = sx / n, ay = sy / n, az = sz / n;

  const verts = new Float32Array(loops.reduce((s, l) => s + l.length, 0) * 9);
  let o = 0;
  loops.forEach((loop) => {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      verts[o++] = ax; verts[o++] = ay; verts[o++] = az;
      verts[o++] = a.x; verts[o++] = a.y; verts[o++] = a.z;
      verts[o++] = b.x; verts[o++] = b.y; verts[o++] = b.z;
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  return geo;
}

function buildSectionCaps(box) {
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.01);
  capPlaneSize = maxDim * 3;
  capLoopEps = maxDim * CAP_LOOP_WELD_TOLERANCE;

  capSource = buildCapSource(modelRoot);
  console.log(`[mini3d] cap section: ${capSource.triCount} segitiga dipakai sebagai sumber irisan potongan`);

  const capPlaneGeo = new THREE.PlaneGeometry(1, 1);
  const keys = Object.keys(clippingPlanes);
  capGroups = {};

  keys.forEach((key, i) => {
    const others = keys.filter((k) => k !== key).map((k) => clippingPlanes[k]);

    // Geometri kipas diisi belakangan (lazy) oleh recomputeCapGeometry
    // tiap kali bidang ini digeser — posisinya berubah-ubah jadi tidak
    // bisa dibangun sekali di awal seperti dulu.
    const fanMat = new THREE.MeshBasicMaterial({
      depthWrite: false,
      depthTest: false,
      colorWrite: false,
      stencilWrite: true,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilFail: THREE.InvertStencilOp,
      stencilZFail: THREE.InvertStencilOp,
      stencilZPass: THREE.InvertStencilOp,
      side: THREE.DoubleSide,
    });
    const fan = new THREE.Mesh(new THREE.BufferGeometry(), fanMat);
    fan.renderOrder = 1 + i * 2;

    const capMat = new THREE.MeshBasicMaterial({
      color: CAP_COLOR,
      side: THREE.DoubleSide,
      clippingPlanes: others,
      stencilWrite: true,
      stencilRef: 0,
      stencilFunc: THREE.NotEqualStencilFunc,
      stencilFail: THREE.ReplaceStencilOp,
      stencilZFail: THREE.ReplaceStencilOp,
      stencilZPass: THREE.ReplaceStencilOp,
    });
    const cap = new THREE.Mesh(capPlaneGeo, capMat);
    cap.renderOrder = 2 + i * 2;
    // Stencil dibersihkan setelah tiap cap supaya bidang berikutnya mulai dari 0.
    cap.onAfterRender = (r) => r.clearStencil();

    [fan, cap].forEach((m) => (m.frustumCulled = false));
    const group = new THREE.Group();
    group.add(fan, cap);
    group.visible = false;
    scene.add(group);
    capGroups[key] = { group, cap, fan };
  });
}

// Hitung ulang geometri kipas cap untuk 1 bidang, di posisinya SEKARANG.
// Dipanggil dari render loop (lihat processDirtyCaps), bukan langsung
// dari slider, supaya kalaupun banyak event slider numpuk di 1 frame,
// yang dihitung cukup 1x per frame per bidang.
function recomputeCapGeometry(key) {
  const g = capGroups && capGroups[key];
  if (!g || !capSource) return;
  const plane = clippingPlanes[key];
  const others = Object.keys(clippingPlanes)
    .filter((k) => k !== key)
    .map((k) => clippingPlanes[k]);

  let loops = intersectPlaneLoops(capSource.pos, capSource.idx, plane, capLoopEps);
  loops = loops
    .map((loop) => others.reduce((pts, p) => clipPolygonByPlane(pts, p), loop))
    .filter((pts) => pts.length >= 3);

  const geo = buildFanGeometry(loops);
  g.fan.geometry.dispose();
  g.fan.geometry = geo;
}

// Dipanggil tiap frame (lihat renderFrame) — hitung ulang cap yang
// posisinya baru saja berubah, lalu bersihkan antriannya.
function processDirtyCaps() {
  if (!capDirty.size || !capGroups) return;
  capDirty.forEach((key) => {
    const g = capGroups[key];
    if (g && g.group.visible) recomputeCapGeometry(key);
  });
  capDirty.clear();
}

// Dipanggil tiap bidang berubah: tampilkan/sembunyikan cap-nya,
// tempelkan bidang hitam tepat di bidang potong, dan tandai geometri
// kipas-nya perlu dihitung ulang (lihat processDirtyCaps).
function updateCapForPlane(key, active) {
  if (!capGroups || !capGroups[key]) return;
  const { group, cap } = capGroups[key];
  group.visible = active;
  if (!active) return;
  const plane = clippingPlanes[key];
  cap.position.copy(plane.normal).multiplyScalar(-plane.constant);
  cap.lookAt(cap.position.clone().add(plane.normal));
  cap.scale.set(capPlaneSize, capPlaneSize, 1);
  capDirty.add(key);
}

/* ---------- Merge mesh statis per material ----------
 * Model ini terdiri dari ribuan mesh terpisah -> ribuan draw call per
 * frame, dan itu bottleneck CPU utama saat diputar. Di sini semua mesh
 * yang memakai material yang SAMA (dan susunan atribut yang sama)
 * digabung jadi satu mesh dalam koordinat dunia. Yang tidak digabung:
 * material transparan (urutan render-nya penting), material array,
 * skinned/instanced, dan mesh dengan morph target. */
function mergeStaticMeshes(root, target) {
  root.updateMatrixWorld(true);
  const merge = BufferGeometryUtils.mergeGeometries || BufferGeometryUtils.mergeBufferGeometries;
  const buckets = new Map();
  let candidates = 0;

  root.traverse((m) => {
    if (!m.isMesh || m.isSkinnedMesh || m.isInstancedMesh || !m.visible) return;
    candidates += 1;
    const mat = m.material;
    const g = m.geometry;
    if (!mat || Array.isArray(mat) || mat.transparent) return;
    if (!g || !g.attributes.position) return;
    if (g.groups.length || Object.keys(g.morphAttributes).length) return;
    if (g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return;
    // Skala negatif membalik winding; untuk geometri non-indexed itu
    // tidak bisa dibalik dengan murah -> biarkan apa adanya.
    if (!g.index && m.matrixWorld.determinant() < 0) return;

    let sig = g.index ? "idx" : "noidx";
    for (const name of Object.keys(g.attributes).sort()) {
      const a = g.attributes[name];
      if (a.isInterleavedBufferAttribute) return;
      sig += `|${name}:${a.itemSize}:${a.array.constructor.name}:${a.normalized ? 1 : 0}`;
    }
    const key = `${mat.uuid}#${sig}#${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(m);
  });

  let mergedCount = 0;
  let absorbed = 0;
  buckets.forEach((meshes) => {
    if (meshes.length < 2) return;
    const geos = meshes.map((m) => {
      const g = m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      if (m.matrixWorld.determinant() < 0 && g.index) {
        const arr = g.index.array;
        for (let t = 0; t + 2 < arr.length; t += 3) {
          const tmp = arr[t + 1];
          arr[t + 1] = arr[t + 2];
          arr[t + 2] = tmp;
        }
      }
      return g;
    });
    const merged = merge(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) return; // atribut tidak cocok -> biarkan mesh asli

    const first = meshes[0];
    const mesh = new THREE.Mesh(merged, first.material);
    mesh.name = "merged:" + (first.material.name || first.material.uuid.slice(0, 6));
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.renderOrder = MODEL_RENDER_ORDER;
    mesh.matrixAutoUpdate = false;
    target.add(mesh);

    meshes.forEach((m) => {
      if (m.parent) m.parent.remove(m);
      m.geometry.dispose();
    });
    mergedCount += 1;
    absorbed += meshes.length;
  });

  return { candidates, mergedCount, absorbed };
}

function initThree() {
  if (initStarted) return;
  initStarted = true;

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
  camera.position.set(2.4, 1.8, 2.6);

  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    stencil: true, // wajib buat cap section (three r163+ default-nya false)
    // logarithmicDepthBuffer sengaja TIDAK dipakai: dia berat di GPU dan,
    // yang lebih penting, polygonOffset (dipakai di bawah buat ngatasi
    // z-fighting) jadi tidak akurat/predictable kalau digabung dengan
    // depth buffer logaritmik. Presisi depth malah dijaga lewat near/far
    // yang lebih rapat (lihat frameCameraToBox).
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.localClippingEnabled = true;
  // Shadow map dihitung sekali aja (bukan tiap frame) — lihat penjelasan
  // shadowMap.autoUpdate di configureShadowLight().
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;

  const hemi = new THREE.HemisphereLight(0xdfe8f5, 0x1a1f2b, 1.15);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1.4);
  dir.position.set(4, 6, 3);
  // Light utama ini yang "mencor" bayangan. Frustum & bias-nya baru
  // di-set final di configureShadowLight() setelah ukuran model diketahui
  // (lihat pemanggilannya di GLTFLoader.load di bawah).
  dir.castShadow = true;
  dir.shadow.mapSize.set(4096, 4096);
  scene.add(dir);
  scene.add(dir.target);
  shadowLight = dir;
  const dir2 = new THREE.DirectionalLight(0xbcd0ee, 0.5);
  dir2.position.set(-4, -2, -3);
  scene.add(dir2);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  // Pan dimatikan supaya target orbit selalu diam di tengah objek —
  // objek jadi tidak akan pernah "kabur" keluar jendela waktu rotate.
  controls.enablePan = false;
  controls.enableZoom = false; // zoom bawaan dimatikan, dipakai manual (lihat bindManualZoom)
  controls.rotateSpeed = 0.8;

  if (ADAPTIVE_PIXEL_RATIO) {
    const fullRatio = Math.min(window.devicePixelRatio || 1, 2);
    if (fullRatio > MOVING_PIXEL_RATIO) {
      let lowRes = false;
      let restoreTimer = null;
      controls.addEventListener("change", () => {
        if (!lowRes) {
          lowRes = true;
          renderer.setPixelRatio(MOVING_PIXEL_RATIO);
        }
        clearTimeout(restoreTimer);
        restoreTimer = setTimeout(() => {
          lowRes = false;
          renderer.setPixelRatio(fullRatio);
        }, 200);
      });
    }
  }
  // Batas sementara, akan diperketat relatif ukuran model lewat
  // frameCameraToBox() setelah model selesai di-load.
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

      // Hitung offset per-mesh: kalau SEMUA material dikasih polygonOffset
      // yang SAMA PERSIS, dua permukaan yang bertumpukan/duplikat (umum di
      // hasil export CAD — makanya kejadian di banyak file GLB berbeda)
      // tetap "seri" persis sama seperti sebelumnya — GPU pilih mana yang
      // menang secara acak/beda tiap frame, itulah yang kelihatan
      // "berkedip". Kasih tiap mesh porsi offset yang SEDIKIT BEDA (siklus
      // kecil) supaya kalau ada dua permukaan bertumpuk, salah satunya
      // selalu konsisten menang tiap frame — kedipnya hilang.
      let meshIndex = 0;

      modelRoot.traverse((child) => {
        if (!child.isMesh) return;
        // Model ikut cast & receive shadow-nya sendiri (self-shadowing) —
        // sebelumnya ini di-false-kan semua sehingga tidak pernah ada
        // bayangan yang dihitung/ditampilkan.
        child.castShadow = true;
        child.receiveShadow = true;
        child.renderOrder = MODEL_RENDER_ORDER; // digambar setelah cap
        meshIndex += 1;
        const offsetUnits = 1 + (meshIndex % 8) * 0.5; // siklus 1..4.5
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((mat) => {
          if (!mat) return;
          // mat.side sengaja TIDAK ditimpa: pakai nilai asli dari GLB
          // (doubleSided). Kalau dipaksa FrontSide, bidang tipis yang
          // aslinya double-sided jadi hilang dari sisi belakang (kelihatan
          // transparan/bolong).
          mat.clippingPlanes = planeList;
          // TRUE (dulu false): bagian yang kepotong section HARUS juga
          // hilang dari perhitungan bayangan & jadi tidak lagi
          // menghalangi cahaya. Dulu ini false, jadi bayangan/halangan
          // cahaya tetap dihitung dari bentuk model yang UTUH (belum
          // dipotong) — makanya potongannya kelihatan gelap terus
          // walau bagian dindingnya sudah "hilang" secara visual.
          mat.clipShadows = true;
          mat.polygonOffset = false;
          mat.polygonOffsetFactor = 0;
          mat.polygonOffsetUnits = 0;
          mat.needsUpdate = true;
        });
      });

      scene.add(modelRoot);
      modelBox = new THREE.Box3().setFromObject(modelRoot);

      frameCameraToBox(modelBox);
      configureShadowLight(modelBox);
      // Scene & light statis (yang gerak cuma kamera orbit-nya), jadi
      // shadow map cukup dihitung SEKALI di sini, bukan tiap frame —
      // sebelumnya ini yang bikin LAG (setiap frame render ulang shadow
      // pass melewati ribuan material di model ini).
      renderer.shadowMap.needsUpdate = true;
      buildSectionCaps(modelBox);

      // Statistik sebelum merge (cap sudah dibangun dari mesh asli).
      const uniqueMats = new Set();
      let meshCount = 0;
      modelRoot.traverse((c) => {
        if (!c.isMesh) return;
        meshCount += 1;
        (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => m && uniqueMats.add(m));
      });
      console.log(`[mini3d] model: ${meshCount} mesh, ${uniqueMats.size} material unik`);

      if (MERGE_STATIC_MESHES) {
        const mergedRoot = new THREE.Group();
        mergedRoot.name = "mini3d-merged";
        scene.add(mergedRoot);
        const st = mergeStaticMeshes(modelRoot, mergedRoot);
        console.log(
          `[mini3d] merge: ${st.absorbed} mesh digabung jadi ${st.mergedCount} mesh ` +
            `(dari ${st.candidates} kandidat)`
        );
      }

      // Model statis: matriks tidak perlu dihitung ulang tiap frame.
      modelRoot.updateMatrixWorld(true);
      modelRoot.traverse((o) => (o.matrixAutoUpdate = false));

      // Ukur beban render sesungguhnya (draw call per frame).
      setTimeout(() => {
        const r = renderer.info.render;
        console.log(`[mini3d] render info: ${r.calls} draw call, ${r.triangles} segitiga per frame`);
      }, 1500);

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
  bindManualZoom();
  resizeObserver = new ResizeObserver(onViewportResize);
  resizeObserver.observe(viewport);
  onViewportResize();
}

function frameCameraToBox(box) {
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.01);
  const dist = maxDim * 1.8;
  camera.position.set(dist * 0.7, dist * 0.55, dist * 0.7);
  // Rasio far/near dirapatkan (dulu 1:10000) sekarang 1:1000 — tanpa
  // logarithmicDepthBuffer, presisi depth buffer sangat bergantung pada
  // rasio ini; rasio yang lebih rapat = presisi jauh lebih baik di jarak
  // pandang yang benar2 dipakai, ini yang paling menentukan z-fighting.
  camera.near = Math.max(maxDim * 0.005, maxDim / 100);
  camera.far = maxDim * 8;
  camera.updateProjectionMatrix();
  controls.target.set(0, 0, 0);

  // Batas zoom relatif ke ukuran model, dilebarkan biar tidak langsung
  // mentok di batas cuma dengan 1x scroll (masih dibatasi, cuma jaraknya
  // dilonggarin biar transisinya smooth & bertahap).
  controls.minDistance = maxDim * 0.15;
  controls.maxDistance = maxDim * 6;
  controls.update();

  // Simpan posisi awal ini supaya tombol Reset bisa mengembalikan
  // kamera, bukan cuma bidang potong section-nya saja.
  initialCameraPos = camera.position.clone();
  initialTarget = controls.target.clone();
}

/* ---------- Shadow ----------
 * Frustum shadow camera & posisi light di-hitung ulang tiap model baru
 * di-load, relatif ke ukuran bounding box-nya (model sudah di-center ke
 * origin duluan) — supaya bayangan tetap pas walau skala model beda-beda,
 * dan supaya resolusi shadow map tidak boros/terlalu kasar.
 */
function configureShadowLight(box) {
  if (!shadowLight) return;
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.01);

  shadowLight.position.set(maxDim * 1.1, maxDim * 1.6, maxDim * 0.8);
  shadowLight.target.position.set(0, 0, 0);
  shadowLight.target.updateMatrixWorld();

  const cam = shadowLight.shadow.camera;
  // Frustum dirapatkan (dulu 1.1x, sekarang 1.02x — cuma cukup buat
  // margin kecil) supaya tiap texel shadow map "menutupi" area model yang
  // lebih kecil = presisi per-piksel jauh lebih tinggi. Shadow map cuma
  // dihitung sekali (autoUpdate=false), jadi resolusi tinggi ini gratis,
  // tidak ada beban tiap frame.
  const half = maxDim * 1.02;
  cam.left = -half;
  cam.right = half;
  cam.top = half;
  cam.bottom = -half;
  cam.near = maxDim * 0.05;
  cam.far = maxDim * 6;
  cam.updateProjectionMatrix();
  // Bias di-skalakan ke ukuran model juga — nilai bias tetap yang kecil
  // bisa memicu "shadow acne" (noise bintik2 di permukaan yang kena sudut
  // serong/grazing terhadap arah cahaya — ini yang muncul di kanopi
  // miring). normalBias dinaikkan jauh lebih besar khusus buat itu.
  shadowLight.shadow.bias = -0.0004;
  shadowLight.shadow.normalBias = maxDim * 0.003;

  // Ground plane transparan cuma buat nangkep bayangan (tidak keliatan
  // sendiri) — sekadar "dudukan" visual di bawah model biar bayangannya
  // jelas kebaca meski model tidak punya lantai/alas yang rata & luas.
  if (!groundShadow) {
    const groundGeo = new THREE.PlaneGeometry(1, 1);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.28 });
    groundShadow = new THREE.Mesh(groundGeo, groundMat);
    groundShadow.rotation.x = -Math.PI / 2;
    groundShadow.receiveShadow = true;
    scene.add(groundShadow);
  }
  const footprint = Math.max(size.x, size.z) * 3;
  groundShadow.scale.set(footprint, footprint, 1);
  groundShadow.position.y = box.min.y - maxDim * 0.001;
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
  const size = modelBox.getSize(new THREE.Vector3());
  const half = size.clone().multiplyScalar(0.5);
  const h = axis === "x" ? half.x : axis === "y" ? half.y : half.z;
  // Margin 2%: bidang potong diletakkan SEDIKIT di luar bounding box.
  // Kalau persis di tepi, permukaan terluar model (dinding luar, lantai,
  // atap) tepat berada di atas bidang potong -> hasil clipping jadi
  // berubah-ubah tiap frame/piksel = berkedip seolah transparan.
  const pad = Math.max(size.x, size.y, size.z) * 0.02;
  return { min: -h - pad, max: h + pad };
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
  // Cap hanya aktif kalau bidang benar2 sudah digeser dari posisi awal.
  updateCapForPlane(
    axis + (kind === "min" ? "Min" : "Max"),
    kind === "min" ? t > 0.001 : t < 0.999
  );
  // Shadow map dihitung sekali & statis (lihat configureShadowLight) —
  // begitu bidang potong bergeser, tandai perlu dihitung ulang supaya
  // bayangan & halangan cahaya ikut mengikuti bentuk yang SUDAH
  // terpotong, bukan bentuk utuh yang lama.
  if (renderer) renderer.shadowMap.needsUpdate = true;
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
    if (!modelBox) return;
    resetSectionPlanes();
    if (initialCameraPos && initialTarget) {
      camera.position.copy(initialCameraPos);
      controls.target.copy(initialTarget);
      controls.update();
    }
  });
}

/* ---------- Render loop (jalan hanya waktu panel terbuka) ---------- */

function renderFrame() {
  if (!renderLoopActive) return;
  controls.update();

  // near/far dinamis mengikuti jarak kamera ke model: rentang depth
  // dirapatkan sekencang mungkin -> presisi depth buffer jauh lebih baik,
  // z-fighting (permukaan bertumpuk hasil CAD) berkurang drastis.
  if (modelBox) {
    const radius = modelBox.getSize(_tmpSize).length() * 0.5;
    const dist = camera.position.distanceTo(controls.target);
    const near = Math.max(dist - radius * 1.1, radius * 0.02);
    const far = dist + radius * 1.1;
    if (Math.abs(near - camera.near) > 1e-6 || Math.abs(far - camera.far) > 1e-6) {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  }

  // Hitung ulang geometri cap yang bidangnya baru saja digeser (kalau
  // ada) — sekali per frame, walaupun event slider yang numpuk sebelum
  // frame ini jauh lebih banyak.
  processDirtyCaps();

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

// Tombol "3D" di icon-rail sekarang jadi satu2nya kontrol buka/tutup
// (toggle) — iconnya tetap kelihatan terus baik panel lagi
// kebuka/ketutup, tidak ada lagi tombol close terpisah.
showBtn.addEventListener("click", () => {
  const isHidden = panel.classList.contains("hidden");
  if (isHidden) {
    panel.classList.remove("hidden");
    showBtn.classList.add("is-active");
    initThree();
    startRenderLoop();
  } else {
    panel.classList.add("hidden");
    showBtn.classList.remove("is-active");
    stopRenderLoop();
    if (document.fullscreenElement === panel) {
      document.exitFullscreen?.();
    }
  }
});

if (fullscreenBtn) {
  fullscreenBtn.addEventListener("click", () => {
    if (document.fullscreenElement === panel) {
      document.exitFullscreen?.();
    } else {
      panel.requestFullscreen?.().catch(() => {});
    }
  });
  document.addEventListener("fullscreenchange", () => {
    panel.classList.toggle("mini3d-fullscreen", document.fullscreenElement === panel);
    onViewportResize();
  });
}

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

/* ---------- Zoom manual (ganti punya OrbitControls) ----------
 * Ternyata zoom bawaan OrbitControls itu ngitung besar-kecilnya step
 * dari besaran deltaY mentah si mouse/trackpad — dan listener wheel-nya
 * sendiri kepasang duluan (sebelum listener kita), jadi coba
 * "meredam" delta dari luar percuma, dia tetap kepakai duluan.
 * Makanya di sini zoom bawaan dimatikan total (enableZoom = false) dan
 * diganti logika sendiri: tiap 1x event wheel cuma menggeser jarak
 * kamera sekian PERSEN TETAP (ZOOM_STEP) — arah ambil dari tanda
 * deltaY-nya doang, besarannya diabaikan. Jadi seberapa pun kasar
 * scroll-nya, satu "tick" tetap cuma gerak dikit & konsisten. */
function bindManualZoom() {
  const ZOOM_STEP = 0.06; // 6% jarak per tick — kecilkan lagi kalau masih kurang halus

  canvas.addEventListener(
    "wheel",
    (e) => {
      if (!camera || !controls) return;
      e.preventDefault();

      const dir = e.deltaY > 0 ? 1 : -1; // out : in — besar delta-nya diabaikan sengaja
      const toCamera = camera.position.clone().sub(controls.target);
      let distance = toCamera.length();
      if (distance < 1e-6) return;

      distance *= 1 + dir * ZOOM_STEP;
      distance = Math.max(controls.minDistance, Math.min(controls.maxDistance, distance));

      toCamera.normalize().multiplyScalar(distance);
      camera.position.copy(controls.target).add(toCamera);
      controls.update();
    },
    { passive: false }
  );
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
