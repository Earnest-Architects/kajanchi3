/**
 * ============================================================
 *  denah-finder.js — tool pencari koordinat titik pada denah
 * ============================================================
 * Halaman terpisah (denah-finder.html), hanya untuk membantu
 * mencari nilai x% dan y% sebuah titik pada gambar denah.
 * Container yang dipakai di sini SAMA PERSIS (class
 * .floorplan-viewport / .floorplan-canvas dari style.css) dengan
 * yang dipakai saat tur berjalan, supaya persentase yang
 * dihasilkan cocok 1:1 dengan posisi titik saat tur benar-benar
 * ditampilkan. Tidak menyimpan apa pun ke server — hasilnya
 * disalin lalu ditempel manual ke "points" di js/content.js.
 * ============================================================
 */
import { floors, views } from "./content.js";

const floorSelect = document.getElementById("floor-select");
const targetSelect = document.getElementById("target-select");
const denahViewport = document.getElementById("denah-viewport");
const denahCanvas = document.getElementById("denah-canvas");
const denahImg = document.getElementById("denah-img");
const coordDisplay = document.getElementById("coord-display");
const pointList = document.getElementById("point-list");
const pointEmpty = document.getElementById("point-empty");
const copyAllBtn = document.getElementById("copy-all-btn");
const snippetOutput = document.getElementById("snippet-output");

let points = []; // { target, x, y, label }
let lastCoord = null;

/* ---------- Isi dropdown "Lantai" & "Target" dari content.js ---------- */

floors.forEach((f) => {
  const opt = document.createElement("option");
  opt.value = f.id;
  opt.textContent = `${f.id} — ${f.name || f.label}`;
  floorSelect.appendChild(opt);
});

views.forEach((v) => {
  const opt = document.createElement("option");
  opt.value = v.id;
  opt.textContent = `${v.id} — ${v.title}`;
  targetSelect.appendChild(opt);
});

/* ---------- Muat lantai yang dipilih ---------- */

function loadFloor(id) {
  const floor = floors.find((f) => f.id === id);
  if (!floor) return;
  denahImg.alt = floor.name || floor.label;
  points = [];
  resetCoordDisplay();
  renderPointList();
  renderDots();

  // #denah-viewport tidak punya tinggi tetap (lihat css/denah-finder.css),
  // jadi begitu gambar selesai dimuat, tinggi container disamakan dengan
  // rasio asli gambar (aspect-ratio) supaya box-nya kelihatan & persentase
  // x/y yang dihasilkan cocok 1:1 dengan tampilan gambar (tidak ada celah
  // kosong dari object-fit: contain).
  denahImg.onload = () => {
    denahViewport.style.aspectRatio = `${denahImg.naturalWidth} / ${denahImg.naturalHeight}`;
  };
  denahImg.src = floor.image;
}

floorSelect.addEventListener("change", () => loadFloor(floorSelect.value));
loadFloor(floors[0].id);

/* ---------- Klik pada denah -> hitung persentase x/y ---------- */

function clampPercent(n) {
  return Math.min(100, Math.max(0, Number(n.toFixed(1))));
}

denahViewport.addEventListener("click", (e) => {
  const rect = denahViewport.getBoundingClientRect();
  const x = clampPercent(((e.clientX - rect.left) / rect.width) * 100);
  const y = clampPercent(((e.clientY - rect.top) / rect.height) * 100);
  showCoord(x, y);
});

function resetCoordDisplay() {
  lastCoord = null;
  coordDisplay.innerHTML = `<span class="placeholder">Klik di gambar denah untuk melihat x% &amp; y%…</span>`;
}

function showCoord(x, y) {
  lastCoord = { x, y };
  coordDisplay.innerHTML = `
    <div>x: <b>${x}%</b></div>
    <div>y: <b>${y}%</b></div>
    <button type="button" id="add-point-btn">+ Tambah ke daftar</button>
  `;
  document.getElementById("add-point-btn").addEventListener("click", () => {
    points.push({ ...lastCoord, target: targetSelect.value, label: "" });
    renderPointList();
    renderDots();
  });
  renderDots(lastCoord);
}

/* ---------- Titik pada gambar denah (pratinjau) ---------- */

function renderDots(pending) {
  denahCanvas.querySelectorAll(".viewpoint-dot").forEach((d) => d.remove());

  points.forEach((p) => {
    const dot = document.createElement("span");
    dot.className = "viewpoint-dot saved";
    dot.style.left = p.x + "%";
    dot.style.top = p.y + "%";
    denahCanvas.appendChild(dot);
  });

  if (pending) {
    const dot = document.createElement("span");
    dot.className = "viewpoint-dot pending";
    dot.style.left = pending.x + "%";
    dot.style.top = pending.y + "%";
    denahCanvas.appendChild(dot);
  }
}

/* ---------- Daftar titik yang sudah diambil ---------- */

function renderPointList() {
  pointList.innerHTML = "";
  pointEmpty.style.display = points.length === 0 ? "block" : "none";

  points.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "point-row";
    row.innerHTML = `
      <span class="point-coord">x ${p.x}%, y ${p.y}% → ${p.target}</span>
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
      renderDots();
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
    const labelPart = p.label ? `, label: "${p.label}"` : "";
    return `  { target: "${p.target}", x: ${p.x}, y: ${p.y}${labelPart} },`;
  });
  const snippet = `points: [\n${lines.join("\n")}\n],`;
  snippetOutput.value = snippet;
  snippetOutput.select();

  if (navigator.clipboard) {
    navigator.clipboard.writeText(snippet).then(() => {
      copyAllBtn.textContent = "Tersalin ke clipboard!";
      window.setTimeout(() => (copyAllBtn.textContent = "Copy sebagai kode points"), 1400);
    });
  }
});
