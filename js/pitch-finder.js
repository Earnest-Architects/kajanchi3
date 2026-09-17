/**
 * ============================================================
 *  pitch-finder.js — tool pencari koordinat pitch/yaw
 * ============================================================
 * Halaman terpisah (pitch-finder.html), hanya untuk membantu
 * mencari nilai pitch & yaw sebuah titik di dalam gambar 360.
 * Tidak menyimpan apa pun ke server — hasilnya cukup disalin
 * lalu ditempel manual ke "pitchPoints" di js/content.js.
 *
 * Interaksi diatur lewat 2 tombol MODE yang saling eksklusif:
 *  - "Rotasi"      -> pannellum bebas digeser seperti biasa,
 *                      klik TIDAK menambah titik.
 *  - "Ambil Titik" -> geser/drag pannellum benar-benar
 *                      dimatikan (config.draggable = false),
 *                      klik akan menampilkan pitch & yaw.
 * ============================================================
 */
import { views, contents } from "./content.js";

const panoramaEl = document.getElementById("panorama");
const viewSelect = document.getElementById("view-select");
const targetSelect = document.getElementById("target-select");
const coordDisplay = document.getElementById("coord-display");
const pointList = document.getElementById("point-list");
const pointEmpty = document.getElementById("point-empty");
const copyAllBtn = document.getElementById("copy-all-btn");
const snippetOutput = document.getElementById("snippet-output");
const modeRotateBtn = document.getElementById("mode-rotate-btn");
const modePointBtn = document.getElementById("mode-point-btn");

// Bar target terpisah: "Panorama" (menuju view 360 lain, tampilan
// lama) vs "Content" (menuju foto/link/video/embed di content.js) —
// supaya tidak ketuker saat memilih target sebuah titik.
const targetTypeSceneBtn = document.getElementById("target-type-scene-btn");
const targetTypeContentBtn = document.getElementById("target-type-content-btn");
const targetSceneField = document.getElementById("target-scene-field");
const targetContentField = document.getElementById("target-content-field");
const targetContentSelect = document.getElementById("target-content-select");
const targetContentEmpty = document.getElementById("target-content-empty");

let viewer = null;
let points = []; // { pitch, yaw, type, target, label }
let lastCoord = null;
let targetType = "scene"; // "scene" | "content"

/* ---------- Mode: "rotate" (lihat sekeliling) atau "point" (ambil titik) ---------- */

// Hanya satu mode yang aktif dalam satu waktu. Saat mode "point" aktif,
// rotasi pannellum benar-benar dimatikan lewat opsi bawaan pannellum
// (draggable: false) — bukan cuma "dicegat" lewat trik event listener
// yang gampang kalah rebutan urutan dengan listener internal pannellum.
// Sebaliknya saat mode "rotate" aktif, klik di panorama diabaikan
// (tidak menambah titik), jadi geser/lihat sekeliling normal seperti
// pannellum biasa.
let mode = "rotate";

function setMode(newMode) {
  mode = newMode;

  modeRotateBtn.classList.toggle("active", mode === "rotate");
  modeRotateBtn.setAttribute("aria-pressed", String(mode === "rotate"));
  modePointBtn.classList.toggle("active", mode === "point");
  modePointBtn.setAttribute("aria-pressed", String(mode === "point"));

  panoramaEl.classList.toggle("mode-rotate", mode === "rotate");
  panoramaEl.classList.toggle("mode-point", mode === "point");

  if (viewer) {
    // pannellum membaca config.draggable setiap kali mouse ditekan,
    // jadi bisa diubah langsung tanpa perlu reload/reinit viewer.
    viewer.getConfig().draggable = mode === "rotate";
  }
}

modeRotateBtn.addEventListener("click", () => setMode("rotate"));
modePointBtn.addEventListener("click", () => setMode("point"));

/* ---------- Tipe target: "Panorama" atau "Content" ---------- */

function setTargetType(type) {
  targetType = type;

  targetTypeSceneBtn.classList.toggle("active", type === "scene");
  targetTypeSceneBtn.setAttribute("aria-pressed", String(type === "scene"));
  targetTypeContentBtn.classList.toggle("active", type === "content");
  targetTypeContentBtn.setAttribute("aria-pressed", String(type === "content"));

  targetSceneField.hidden = type !== "scene";
  targetContentField.hidden = type !== "content";
}

targetTypeSceneBtn.addEventListener("click", () => setTargetType("scene"));
targetTypeContentBtn.addEventListener("click", () => setTargetType("content"));
setTargetType("scene");

/* ---------- Isi dropdown "Target Content" dari array `contents` ---------- */

function fillContentTargetOptions() {
  targetContentSelect.innerHTML = "";
  contents.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = `${c.id} — ${c.title}`;
    targetContentSelect.appendChild(opt);
  });
  const isEmpty = contents.length === 0;
  targetContentSelect.style.display = isEmpty ? "none" : "";
  targetContentEmpty.hidden = !isEmpty;
}
fillContentTargetOptions();

/* ---------- Isi dropdown "Gambar 360" & "Target" dari content.js ---------- */

views.forEach((v) => {
  const opt = document.createElement("option");
  opt.value = v.id;
  opt.textContent = `${v.id} — ${v.title}`;
  viewSelect.appendChild(opt);
});

function fillTargetOptions() {
  targetSelect.innerHTML = "";
  views.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v.id;
    opt.textContent = `${v.id} — ${v.title}`;
    targetSelect.appendChild(opt);
  });
}
fillTargetOptions();

/* ---------- Muat gambar 360 yang dipilih ---------- */

function loadView(id) {
  const v = views.find((x) => x.id === id);
  if (!v) return;
  if (viewer) viewer.destroy();
  viewer = pannellum.viewer("panorama", {
    type: "equirectangular",
    panorama: v.image,
    autoLoad: true,
    showControls: false,
    compass: false,
    hfov: 100,
    draggable: mode === "rotate", // ikut mode yang sedang aktif
  });
  points = [];
  resetCoordDisplay();
  renderPointList();
}

viewSelect.addEventListener("change", () => loadView(viewSelect.value));
setMode(mode); // set tampilan tombol & cursor sesuai mode awal
loadView(views[0].id);

/* ---------- Klik di panorama (hanya berlaku saat mode "point") ---------- */

// Karena drag sudah dimatikan total lewat config.draggable saat mode
// "point" aktif, di sini tidak perlu lagi membedakan klik vs drag —
// event "click" bawaan browser sudah otomatis hanya terpicu untuk
// klik biasa (tanpa geser berarti).
panoramaEl.addEventListener("click", (e) => {
  if (mode !== "point") return; // mode "rotate": biarkan pannellum yang urus
  if (!viewer) return;

  const coords = viewer.mouseEventToCoords(e);
  if (!coords) return;
  const [pitch, yaw] = coords;
  showCoord(pitch, yaw);
});

function resetCoordDisplay() {
  lastCoord = null;
  coordDisplay.innerHTML = `<span class="placeholder">Klik di dalam gambar 360 untuk melihat pitch &amp; yaw…</span>`;
}

function showCoord(pitch, yaw) {
  lastCoord = { pitch: Number(pitch.toFixed(2)), yaw: Number(yaw.toFixed(2)) };
  coordDisplay.innerHTML = `
    <div>pitch: <b>${lastCoord.pitch}</b></div>
    <div>yaw: <b>${lastCoord.yaw}</b></div>
    <button type="button" id="add-point-btn">+ Tambah ke daftar</button>
  `;
  document.getElementById("add-point-btn").addEventListener("click", () => {
    if (targetType === "content") {
      if (!targetContentSelect.value) return; // belum ada content di content.js
      points.push({ ...lastCoord, type: "content", target: targetContentSelect.value, label: "" });
    } else {
      points.push({ ...lastCoord, type: "scene", target: targetSelect.value, label: "" });
    }
    renderPointList();
  });
}

/* ---------- Daftar titik yang sudah diambil ---------- */

function renderPointList() {
  pointList.innerHTML = "";
  pointEmpty.style.display = points.length === 0 ? "block" : "none";

  points.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "point-row";
    const typeIcon = p.type === "content" ? "🧩" : "🖼️";
    row.innerHTML = `
      <span class="point-coord">pitch ${p.pitch}, yaw ${p.yaw} → ${typeIcon} ${p.target}</span>
      <input type="text" class="point-label-input" placeholder="label (opsional)" value="${p.label}" data-i="${i}" />
      <button type="button" class="point-remove-btn" data-i="${i}" aria-label="Hapus">✕</button>
    `;
    pointList.appendChild(row);
  });

  pointList.querySelectorAll(".point-label-input").forEach((inp) => {
    inp.addEventListener("input", (e) => {
      points[Number(e.target.dataset.i)].label = e.target.value;
    });
  });
  pointList.querySelectorAll(".point-remove-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      points.splice(Number(e.target.dataset.i), 1);
      renderPointList();
    });
  });
}

/* ---------- Copy sebagai kode siap-tempel ke content.js ---------- */

copyAllBtn.addEventListener("click", () => {
  if (points.length === 0) {
    snippetOutput.value = "// Belum ada titik untuk disalin.";
    return;
  }
  const lines = points.map((p) => {
    const typePart = p.type === "content" ? `type: "content", ` : "";
    const labelPart = p.label ? `, label: "${p.label}"` : "";
    return `  { ${typePart}pitch: ${p.pitch}, yaw: ${p.yaw}, target: "${p.target}"${labelPart} },`;
  });
  const snippet = `pitchPoints: [\n${lines.join("\n")}\n],`;
  snippetOutput.value = snippet;
  snippetOutput.select();

  if (navigator.clipboard) {
    navigator.clipboard.writeText(snippet).then(() => {
      copyAllBtn.textContent = "Tersalin ke clipboard!";
      window.setTimeout(() => (copyAllBtn.textContent = "Copy sebagai kode pitchPoints"), 1400);
    });
  }
});
