/**
 * ============================================================
 *  photo-cg.js — jendela "3D Carousel" (fitur Photos), Three.js
 * ============================================================
 * Dibuka lewat tombol ikon galeri di icon-rail kiri-bawah.
 * Carousel dirender pakai WebGL (Three.js) supaya foto utama
 * benar-benar berada di depan secara 3D (tidak akan pernah
 * tertutup foto samping seperti versi DOM sebelumnya), dan bisa
 * di-sweep pakai mouse/jari dengan gerakan yang halus.
 *
 * - Foto tengah (aktif)  : besar, terang penuh, paling depan.
 * - Foto samping         : lebih kecil, mundur ke belakang &
 *                           diputar (rotateY), digelapkan 50%.
 * - Sweep mouse/touch    : drag horizontal memutar carousel
 *                           secara realtime, lalu snap halus ke
 *                           foto terdekat saat dilepas.
 * - Klik foto tengah     : load view 360 tujuan LANGSUNG (di
 *                           belakang overlay), lalu canvas di-zoom
 *                           + blur cepat sebelum overlay ditutup
 *                           (transisi terasa menyatu/tidak patah).
 * - Klik foto samping    : carousel diputar halus ke foto itu.
 * ============================================================ */
import { photoCG } from "./content.js";
import { goToView } from "./viewer.js";
import * as THREE from "three";

const OPEN_CLOSE_MS = 2000; // durasi opening/closing overlay
const NAV_MS = 650;         // durasi zoom+blur cepat menuju view hotspot
const N = photoCG.length;

const overlay = document.getElementById("cg-overlay");
const stage = document.getElementById("cg-stage");
const showBtn = document.getElementById("cg-carousel-show-btn");
const closeBtn = document.getElementById("cg-close-btn");
const prevBtn = document.getElementById("cg-prev-btn");
const nextBtn = document.getElementById("cg-next-btn");

const caption = document.createElement("div");
caption.className = "cg-caption";
stage.appendChild(caption);

let renderer = null;
let scene, camera;
let meshes = [];
let raycaster;

let position = 0;       // posisi kontinu (boleh pecahan saat drag/animasi)
let targetPosition = 0; // target integer yang sedang dituju
let running = false;
let closeTimer = null;

let dragging = false;
let moved = false;
let dragStartX = 0;
let dragStartPos = 0;

function initThree() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 7.6);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.className = "cg-canvas";
  stage.insertBefore(renderer.domElement, caption);

  raycaster = new THREE.Raycaster();

  const loader = new THREE.TextureLoader();
  const geo = new THREE.PlaneGeometry(4.8, 3.6); // rasio 8:6

  meshes = photoCG.map((item) => {
    const tex = loader.load(item.image);
    if ("colorSpace" in tex) tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    return mesh;
  });

  resize();
}

function resize() {
  if (!renderer) return;
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

/** Jarak melingkar terpendek (boleh pecahan) dari index i ke posisi saat ini. */
function wrappedOffset(i, pos) {
  let raw = i - pos;
  raw = ((raw % N) + N) % N;
  if (raw > N / 2) raw -= N;
  return raw;
}

function layout() {
  let nearest = 0;
  let nearestAbs = Infinity;

  meshes.forEach((mesh, i) => {
    const raw = wrappedOffset(i, position);
    const abs = Math.abs(raw);
    if (abs < nearestAbs) { nearestAbs = abs; nearest = i; }

    const x = raw * 2.85;
    const z = -Math.min(abs, 2.2) * 2.1;
    const rotY = THREE.MathUtils.clamp(-raw, -1.3, 1.3) * 0.6;
    const scale = 1 - Math.min(abs, 2) * 0.16;
    // Foto tengah terang penuh; foto samping digelapkan 50%.
    const brightness = THREE.MathUtils.lerp(1, 0.5, THREE.MathUtils.clamp(abs / 0.85, 0, 1));
    const opacity = THREE.MathUtils.clamp(1.2 - abs * 0.5, 0, 1);

    mesh.position.set(x, 0, z);
    mesh.rotation.y = rotY;
    mesh.scale.setScalar(Math.max(scale, 0.45));
    mesh.material.color.setScalar(brightness);
    mesh.material.opacity = opacity;
    mesh.renderOrder = Math.round(100 - abs * 10);
  });

  return nearest;
}

function tick() {
  if (!running) return;
  if (!dragging) {
    position += (targetPosition - position) * 0.16;
    if (Math.abs(targetPosition - position) < 0.002) position = targetPosition;
  }
  const nearest = layout();
  const title = photoCG[nearest]?.title || "";
  if (caption.textContent !== title) caption.textContent = title;
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

function start() {
  if (!renderer) initThree();
  resize();
  if (!running) {
    running = true;
    requestAnimationFrame(tick);
  }
}

function stop() {
  running = false;
}

/** Set target index tujuan, pilih arah lingkaran terpendek dari posisi sekarang. */
function setTarget(idx) {
  let candidate = idx;
  if (Math.abs(idx + N - position) < Math.abs(candidate - position)) candidate = idx + N;
  if (Math.abs(idx - N - position) < Math.abs(candidate - position)) candidate = idx - N;
  targetPosition = candidate;
}

function step(dir) {
  setTarget((Math.round(targetPosition) + dir + N * 10) % N);
}

function open() {
  clearTimeout(closeTimer);
  overlay.classList.remove("cg-navigating");
  overlay.classList.remove("hidden");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => overlay.classList.add("cg-visible"));
  });
  start();
  window.addEventListener("resize", resize);
}

function close() {
  overlay.classList.remove("cg-visible");
  overlay.classList.remove("cg-navigating");
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    overlay.classList.add("hidden");
    stop();
    window.removeEventListener("resize", resize);
  }, OPEN_CLOSE_MS);
}

/** Klik foto tengah: load scene 360 tujuan LANGSUNG di background,
 *  sambil canvas di-zoom + blur cepat & layar menggelap total,
 *  baru overlay ditutup total setelah view-nya sudah pasti tampil. */
function goToHotspot(targetId) {
  goToView(targetId);
  overlay.classList.add("cg-navigating");
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    overlay.classList.remove("cg-visible", "cg-navigating");
    overlay.classList.add("hidden");
    stop();
    window.removeEventListener("resize", resize);
  }, NAV_MS);
}

function pointerToNdc(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  return new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );
}

function handleClick(e) {
  raycaster.setFromCamera(pointerToNdc(e), camera);
  const hits = raycaster.intersectObjects(meshes);
  if (!hits.length) return;
  const idx = meshes.indexOf(hits[0].object);
  const activeIdx = ((Math.round(targetPosition) % N) + N) % N;
  if (idx === activeIdx) {
    goToHotspot(photoCG[idx].target);
  } else {
    setTarget(idx);
  }
}

function pointerDown(e) {
  if (overlay.classList.contains("cg-navigating") || !renderer) return;
  dragging = true;
  moved = false;
  dragStartX = e.clientX;
  dragStartPos = position;
  stage.setPointerCapture?.(e.pointerId);
}

function pointerMove(e) {
  if (!dragging) return;
  const dx = e.clientX - dragStartX;
  if (Math.abs(dx) > 4) moved = true;
  position = dragStartPos - dx / 240;
}

function pointerUp(e) {
  if (!dragging) return;
  dragging = false;
  const nearestIdx = ((Math.round(position) % N) + N) % N;
  setTarget(nearestIdx);
  if (!moved) handleClick(e);
}

stage.addEventListener("pointerdown", pointerDown);
stage.addEventListener("pointermove", pointerMove);
window.addEventListener("pointerup", pointerUp);

showBtn.addEventListener("click", open);
closeBtn.addEventListener("click", close);
prevBtn.addEventListener("click", () => step(-1));
nextBtn.addEventListener("click", () => step(1));
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) close();
});
document.addEventListener("keydown", (e) => {
  if (overlay.classList.contains("hidden") || overlay.classList.contains("cg-navigating")) return;
  if (e.key === "Escape") close();
  if (e.key === "ArrowLeft") step(-1);
  if (e.key === "ArrowRight") step(1);
});
