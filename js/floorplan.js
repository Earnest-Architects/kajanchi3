/**
 * ============================================================
 *  floorplan.js — panel denah kanan-bawah
 * ============================================================
 * Tab pilih lantai, titik pandang yang bisa diklik untuk pindah
 * view, dan zoom/pan gambar denah. Semua data (lantai, titik)
 * dibaca langsung dari content.js — tambah/hapus lantai atau
 * titik di sana, panel ini otomatis menyesuaikan.
 * ============================================================
 */
import { floors, findFloor, floorsForView, labelForTarget } from "./content.js";
import { getCurrentViewId, tourEvents } from "./state.js";
import { goToView } from "./viewer.js";

let activeFloorId = floors[0].id;

/* ---------- DOM refs ---------- */

const floorTabsWrap = document.getElementById("floor-tabs");
const floorplanImg = document.getElementById("floorplan-img");
const floorplanCanvas = document.getElementById("floorplan-canvas");
const floorplanPanel = document.getElementById("floorplan-panel");
const floorplanHideBtn = document.getElementById("floorplan-hide-btn");
const floorplanShowBtn = document.getElementById("floorplan-show-btn");
const floorplanViewport = document.getElementById("floorplan-viewport");
const zoomInBtn = document.getElementById("zoom-in-btn");
const zoomOutBtn = document.getElementById("zoom-out-btn");
const zoomResetBtn = document.getElementById("zoom-reset-btn");
const floorplanResizeHandle = document.getElementById("floorplan-resize-handle");

/* ---------- Tab lantai ---------- */

floors.forEach((floor) => {
  const tab = document.createElement("button");
  tab.type = "button";
  tab.className = "floor-tab";
  tab.dataset.floor = floor.id;
  tab.textContent = floor.label;
  tab.setAttribute("role", "tab");
  tab.addEventListener("click", () => setActiveFloor(floor.id));
  floorTabsWrap.appendChild(tab);
});

function setActiveFloor(floorId) {
  activeFloorId = floorId;
  const floor = findFloor(floorId);
  if (floor) {
    floorplanImg.src = floor.image;
    floorplanImg.alt = floor.name + "の平面図と視点";
  }
  document.querySelectorAll(".floor-tab").forEach((tab) => {
    const isActive = tab.dataset.floor === floorId;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });
  resetZoom();
  renderViewpointDots();
}

/* ---------- Titik pandang (dots) di atas denah ---------- */

function renderViewpointDots() {
  floorplanCanvas.querySelectorAll(".viewpoint-dot").forEach((d) => d.remove());
  const floor = findFloor(activeFloorId);
  (floor ? floor.points : []).forEach((point) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "viewpoint-dot";
    dot.dataset.view = point.target;
    dot.style.left = point.x + "%";
    dot.style.top = point.y + "%";
    dot.setAttribute("aria-label", "View from this point: " + labelForTarget(point.target, point.label));
    dot.addEventListener("click", () => {
      if (point.target === getCurrentViewId()) return;
      goToView(point.target);
    });
    floorplanCanvas.appendChild(dot);
  });
  highlightActiveDot();
}

function highlightActiveDot() {
  const currentId = getCurrentViewId();
  document.querySelectorAll(".viewpoint-dot").forEach((dot) => {
    dot.classList.toggle("active", dot.dataset.view === currentId);
  });
}

/** Setiap kali view berpindah, cek apakah masih perlu pindah tab lantai juga. */
tourEvents.on("scenechange", ({ id }) => {
  const floorsHere = floorsForView(id);
  if (floorsHere.length && !floorsHere.some((f) => f.id === activeFloorId)) {
    setActiveFloor(floorsHere[0].id);
  } else {
    highlightActiveDot();
  }
});

/* ---------- Sembunyikan / tampilkan panel denah ---------- */

floorplanHideBtn.addEventListener("click", () => {
  floorplanPanel.classList.add("hidden");
  floorplanShowBtn.classList.add("visible");
});
floorplanShowBtn.addEventListener("click", () => {
  floorplanPanel.classList.remove("hidden");
  floorplanShowBtn.classList.remove("visible");
});

/* ---------- Zoom & pan gambar denah ---------- */

const ZOOM_MIN = 1;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.5;
let zoomLevel = 1;
let panX = 0;
let panY = 0;

/*
 * PENTING: kotak window (.floorplan-viewport) dan gambar JPG-nya belum tentu
 * proporsi/rasio yang sama — apalagi sekarang windownya bisa di-resize bebas.
 * .floorplan-canvas dulu asal inset:0 (ikut penuh kotak window), jadi titik
 * hotspot yang dipatok pakai persen (%) ikut persen KOTAK, bukan persen GAMBAR
 * — itu sebabnya melenceng saat window & gambar beda rasio.
 *
 * Perbaikannya: hitung sendiri area gambar yang benar-benar tampil (mengikuti
 * rumus object-fit: contain) lalu paksa .floorplan-canvas persis di area itu
 * (bukan penuh kotak window). Dengan begitu persen x/y titik selalu dihitung
 * relatif ke GAMBAR asli, berapa pun ukuran windownya.
 */
let canvasBaseWidth = 0;
let canvasBaseHeight = 0;

function updateCanvasLayout() {
  const containerWidth = floorplanViewport.clientWidth;
  const containerHeight = floorplanViewport.clientHeight;
  const naturalW = floorplanImg.naturalWidth;
  const naturalH = floorplanImg.naturalHeight;
  if (!containerWidth || !containerHeight || !naturalW || !naturalH) return;

  const containerRatio = containerWidth / containerHeight;
  const imgRatio = naturalW / naturalH;
  let width, height;
  if (imgRatio > containerRatio) {
    width = containerWidth;
    height = containerWidth / imgRatio;
  } else {
    height = containerHeight;
    width = containerHeight * imgRatio;
  }

  canvasBaseWidth = width;
  canvasBaseHeight = height;
  floorplanCanvas.style.left = (containerWidth - width) / 2 + "px";
  floorplanCanvas.style.top = (containerHeight - height) / 2 + "px";
  floorplanCanvas.style.width = width + "px";
  floorplanCanvas.style.height = height + "px";

  clampPan();
  applyTransform();
}

function applyTransform() {
  floorplanCanvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
}

function clampPan() {
  // Dibatasi oleh ukuran GAMBAR yang sudah di-zoom (canvasBaseWidth/Height),
  // bukan ukuran kotak window — supaya tidak bisa pan sampai muncul area
  // kosong di luar gambar.
  const viewportWidth = floorplanViewport.clientWidth;
  const viewportHeight = floorplanViewport.clientHeight;
  const maxX = Math.max(0, (canvasBaseWidth * zoomLevel - viewportWidth) / 2);
  const maxY = Math.max(0, (canvasBaseHeight * zoomLevel - viewportHeight) / 2);
  panX = Math.min(maxX, Math.max(-maxX, panX));
  panY = Math.min(maxY, Math.max(-maxY, panY));
}

function updateZoomUI() {
  zoomOutBtn.disabled = zoomLevel <= ZOOM_MIN;
  zoomInBtn.disabled = zoomLevel >= ZOOM_MAX;
  zoomResetBtn.textContent = zoomLevel.toFixed(1).replace(".0", "") + "×";
  floorplanViewport.classList.toggle("zoomed", zoomLevel > 1);
}

function setZoom(next) {
  zoomLevel = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)) * 100) / 100;
  clampPan();
  applyTransform();
  updateZoomUI();
}

function resetZoom() {
  zoomLevel = 1;
  panX = 0;
  panY = 0;
  floorplanCanvas.classList.add("smooth");
  applyTransform();
  updateZoomUI();
  window.setTimeout(() => floorplanCanvas.classList.remove("smooth"), 220);
}

zoomInBtn.addEventListener("click", () => setZoom(zoomLevel + ZOOM_STEP));
zoomOutBtn.addEventListener("click", () => setZoom(zoomLevel - ZOOM_STEP));
zoomResetBtn.addEventListener("click", resetZoom);

let dragging = false;
let dragStartX = 0;
let dragStartY = 0;
let panStartX = 0;
let panStartY = 0;

floorplanViewport.addEventListener("pointerdown", (e) => {
  if (zoomLevel <= 1) return;
  if (e.target.closest(".viewpoint-dot")) return; // biarkan titik tetap bisa diklik normal
  dragging = true;
  floorplanCanvas.classList.remove("smooth");
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  panStartX = panX;
  panStartY = panY;
  floorplanViewport.setPointerCapture(e.pointerId);
});
floorplanViewport.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  panX = panStartX + (e.clientX - dragStartX);
  panY = panStartY + (e.clientY - dragStartY);
  clampPan();
  applyTransform();
});
["pointerup", "pointercancel", "pointerleave"].forEach((evt) => {
  floorplanViewport.addEventListener(evt, () => {
    dragging = false;
  });
});

// Scroll wheel untuk zoom (desktop)
floorplanViewport.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    setZoom(zoomLevel + (e.deltaY < 0 ? 0.25 : -0.25));
  },
  { passive: false }
);

/* ---------- Resize window panel (bebas diperbesar/diperkecil) ---------- */
/*
 * Panel ini nge-anchor di kanan-bawah layar (lihat .nav-panel di CSS), jadi
 * saat width/height bertambah, sisi kiri & atas yang bergerak menjauh dari
 * sudut kanan-bawah. Makanya handle-nya diletakkan di pojok kiri-atas panel:
 * drag menjauh (kiri-atas) = membesar, drag mendekat (kanan-bawah) = mengecil.
 */
const RESIZE_SIZE_KEY = "luma-floorplan-panel-size";
const PANEL_MIN_WIDTH = 160;
const PANEL_MIN_HEIGHT = 220;
const DEFAULT_PANEL_WIDTH = 220;
const DEFAULT_PANEL_HEIGHT = 320;

function panelMaxWidth() {
  return Math.min(window.innerWidth - 40, 560);
}
function panelMaxHeight() {
  return Math.min(window.innerHeight - 40, 720);
}

function setPanelSize(width, height) {
  const w = Math.min(panelMaxWidth(), Math.max(PANEL_MIN_WIDTH, width));
  const h = Math.min(panelMaxHeight(), Math.max(PANEL_MIN_HEIGHT, height));
  floorplanPanel.style.width = w + "px";
  floorplanPanel.style.height = h + "px";
  updateCanvasLayout();
}

function savePanelSize() {
  try {
    localStorage.setItem(
      RESIZE_SIZE_KEY,
      JSON.stringify({ w: floorplanPanel.offsetWidth, h: floorplanPanel.offsetHeight })
    );
  } catch (_) {
    /* localStorage tidak tersedia — abaikan saja */
  }
}

function restorePanelSize() {
  try {
    const raw = localStorage.getItem(RESIZE_SIZE_KEY);
    if (!raw) return;
    const { w, h } = JSON.parse(raw);
    if (w && h) setPanelSize(w, h);
  } catch (_) {
    /* data korup / tidak tersedia — pakai ukuran default dari CSS */
  }
}

let resizingPanel = false;
let resizeStartX = 0;
let resizeStartY = 0;
let resizeStartWidth = 0;
let resizeStartHeight = 0;

floorplanResizeHandle.addEventListener("pointerdown", (e) => {
  resizingPanel = true;
  const rect = floorplanPanel.getBoundingClientRect();
  resizeStartWidth = rect.width;
  resizeStartHeight = rect.height;
  resizeStartX = e.clientX;
  resizeStartY = e.clientY;
  floorplanPanel.classList.add("resizing");
  floorplanResizeHandle.setPointerCapture(e.pointerId);
  e.preventDefault();
});
floorplanResizeHandle.addEventListener("pointermove", (e) => {
  if (!resizingPanel) return;
  const dx = resizeStartX - e.clientX; // drag ke kiri -> lebar bertambah
  const dy = resizeStartY - e.clientY; // drag ke atas -> tinggi bertambah
  setPanelSize(resizeStartWidth + dx, resizeStartHeight + dy);
});
["pointerup", "pointercancel"].forEach((evt) => {
  floorplanResizeHandle.addEventListener(evt, () => {
    if (!resizingPanel) return;
    resizingPanel = false;
    floorplanPanel.classList.remove("resizing");
    savePanelSize();
  });
});
floorplanResizeHandle.addEventListener("dblclick", () => {
  setPanelSize(DEFAULT_PANEL_WIDTH, DEFAULT_PANEL_HEIGHT);
  savePanelSize();
});
window.addEventListener("resize", () => {
  // Jaga panel tetap dalam batas layar kalau window browser di-resize
  setPanelSize(floorplanPanel.offsetWidth, floorplanPanel.offsetHeight);
});

/* ---------- Inisialisasi ---------- */

// Setiap kali gambar denah selesai dimuat (ganti lantai, atau load pertama),
// hitung ulang area gambar yang sebenarnya tampil supaya titik hotspot tetap presisi.
floorplanImg.addEventListener("load", updateCanvasLayout);

// Kalau elemen ukurannya berubah karena alasan lain (mis. breakpoint mobile
// CSS, orientasi device berubah) — bukan cuma lewat handle resize kita — tetap ikut update.
if (typeof ResizeObserver !== "undefined") {
  new ResizeObserver(updateCanvasLayout).observe(floorplanViewport);
}

updateZoomUI();
setActiveFloor(activeFloorId);
restorePanelSize();
// Fallback kalau gambar sudah ke-cache duluan (event "load" bisa saja sudah lewat).
if (floorplanImg.complete && floorplanImg.naturalWidth) {
  updateCanvasLayout();
}
