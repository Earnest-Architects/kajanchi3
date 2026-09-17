/**
 * ============================================================
 *  note-finder.js — halaman menulis catatan hotspot
 * ============================================================
 * Pola mode "Rotate" / "Point" disalin dari pitch-finder.js
 * (draggable dimatikan total lewat config.draggable, bukan sekadar
 * dicegat lewat event listener).
 *
 * Alur menulis catatan baru:
 *   klik di panorama (mode "Point") -> muncul icon 💬 mengambang di
 *   titik itu + form (teks + gambar opsional) -> klik "Save note" ->
 *   data dikirim ke Worker Cloudflare (lihat js/notes-api.js &
 *   js/notes-config.js) -> icon 💬 permanen ditambahkan ke panorama
 *   lewat viewer.addHotSpot().
 *
 * Alur edit/hapus catatan yang sudah ada:
 *   klik icon 💬 catatan yang sudah ditulis -> modal terbuka
 *   (js/note-view.js) selalu menampilkan tombol Edit & Delete —
 *   TIDAK ADA pengecekan kepemilikan, siapa pun yang membuka
 *   halaman ini bisa mengedit/menghapus catatan siapa saja:
 *     - Edit   -> modal ditutup, form di sidebar terbuka lagi terisi
 *                 teks/gambar lama, tombol berubah jadi "Update note".
 *     - Delete -> konfirmasi 2-langkah di modal, lalu catatan dihapus
 *                 dari server & dari panorama.
 * ============================================================ */
import { views } from "./content.js";
import { createNoteHotspotEl } from "./hotspots.js";
import { openNoteModal } from "./note-view.js";
import { fetchNotes, submitNote, updateNote, deleteNote, imageFileToDataUrl } from "./notes-api.js";

const panoramaEl = document.getElementById("panorama");
const pendingMarker = document.getElementById("pending-marker");
const viewSelect = document.getElementById("view-select");
const modeRotateBtn = document.getElementById("mode-rotate-btn");
const modePointBtn = document.getElementById("mode-point-btn");

const noteForm = document.getElementById("note-form");
const noteFormBadge = document.getElementById("note-form-badge");
const noteCoord = document.getElementById("note-coord");
const noteText = document.getElementById("note-text");
const noteImageInput = document.getElementById("note-image");
const noteImagePreview = document.getElementById("note-image-preview");
const noteImagePreviewImg = document.getElementById("note-image-preview-img");
const noteImageRemoveBtn = document.getElementById("note-image-remove-btn");
const noteError = document.getElementById("note-error");
const noteCancelBtn = document.getElementById("note-cancel-btn");
const noteCommitBtn = document.getElementById("note-commit-btn");

const noteList = document.getElementById("note-list");
const noteListEmpty = document.getElementById("note-list-empty");

const sidebarEl = document.getElementById("sidebar");
const sidebarHandle = document.getElementById("sidebar-handle");

/* ---------- Sidebar bottom-sheet (mobile only — no-op on desktop, lihat
 * media query di css/note-finder.css). Peek = hanya handle + mode toggle +
 * pemilih gambar 360 yang tampil, supaya panorama tidak tertutup. Expanded
 * = sheet penuh (form/daftar catatan bisa dipakai). ---------- */
function setSidebarExpanded(expanded) {
  if (!sidebarEl) return;
  sidebarEl.classList.toggle("expanded", expanded);
  if (sidebarHandle) sidebarHandle.setAttribute("aria-expanded", String(expanded));
}
if (sidebarHandle) {
  sidebarHandle.addEventListener("click", () => {
    setSidebarExpanded(!sidebarEl.classList.contains("expanded"));
  });
}

let viewer = null;
let currentViewId = null;
let mode = "rotate"; // "rotate" | "point"
let pendingCoord = null; // { pitch, yaw }
let pendingImageDataUrl = "";
let editingNoteId = null; // null = menulis catatan baru, string = mengedit catatan ini
let committedNotes = []; // catatan yang sudah dibuat/diedit di sesi ini (semua view)

/* ---------- Mode: "rotate" atau "point" (sama persis pola pitch-finder.js) ---------- */

function setMode(newMode) {
  mode = newMode;
  modeRotateBtn.classList.toggle("active", mode === "rotate");
  modeRotateBtn.setAttribute("aria-pressed", String(mode === "rotate"));
  modePointBtn.classList.toggle("active", mode === "point");
  modePointBtn.setAttribute("aria-pressed", String(mode === "point"));
  panoramaEl.classList.toggle("mode-rotate", mode === "rotate");
  panoramaEl.classList.toggle("mode-point", mode === "point");
  if (viewer) viewer.getConfig().draggable = mode === "rotate";
  if (mode === "rotate") closeForm();
}
modeRotateBtn.addEventListener("click", () => setMode("rotate"));
modePointBtn.addEventListener("click", () => setMode("point"));

/* ---------- Dropdown gambar 360 ---------- */

views.forEach((v) => {
  const opt = document.createElement("option");
  opt.value = v.id;
  opt.textContent = `${v.id} — ${v.title}`;
  viewSelect.appendChild(opt);
});

function loadView(id) {
  const v = views.find((x) => x.id === id);
  if (!v) return;
  currentViewId = id;
  if (viewer) viewer.destroy();
  closeForm();
  viewer = pannellum.viewer("panorama", {
    type: "equirectangular",
    panorama: v.image,
    autoLoad: true,
    showControls: false,
    compass: false,
    hfov: 100,
    draggable: mode === "rotate",
  });
  viewer.on("load", () => renderCommittedHotspotsForCurrentView());
}
viewSelect.addEventListener("change", () => loadView(viewSelect.value));
setMode(mode);
loadView(views[0].id);

/* ---------- Klik di panorama (hanya saat mode "point") ---------- */

panoramaEl.addEventListener("click", (e) => {
  if (mode !== "point") return;
  if (!viewer) return;
  const coords = viewer.mouseEventToCoords(e);
  if (!coords) return;
  const [pitch, yaw] = coords;
  openNewNoteFormAt(Number(pitch.toFixed(2)), Number(yaw.toFixed(2)), e.clientX, e.clientY);
});

/* ---------- Form catatan: menulis baru ---------- */

function openNewNoteFormAt(pitch, yaw, clientX, clientY) {
  editingNoteId = null;
  pendingCoord = { pitch, yaw };
  noteFormBadge.textContent = "New note";
  noteCoord.textContent = `${pitch}, ${yaw}`;
  noteText.value = "";
  noteError.hidden = true;
  clearImage();

  const rect = panoramaEl.getBoundingClientRect();
  pendingMarker.style.left = `${clientX - rect.left}px`;
  pendingMarker.style.top = `${clientY - rect.top}px`;
  pendingMarker.hidden = false;

  noteCommitBtn.textContent = "Save note";
  noteForm.hidden = false;
  setSidebarExpanded(true);
  noteText.focus();
}

/* ---------- Form catatan: mengedit yang sudah ada (dipicu dari modal) ---------- */

function openEditNoteForm(note) {
  editingNoteId = note.id;
  pendingCoord = { pitch: note.pitch, yaw: note.yaw };
  noteFormBadge.textContent = "Editing note";
  noteCoord.textContent = `${note.pitch}, ${note.yaw}`;
  noteText.value = note.text || "";
  noteError.hidden = true;

  if (note.image) {
    pendingImageDataUrl = note.image;
    noteImageInput.value = "";
    noteImagePreviewImg.src = note.image;
    noteImagePreview.hidden = false;
  } else {
    clearImage();
  }

  pendingMarker.hidden = true; // titik ini sudah punya icon permanen di panorama
  noteCommitBtn.textContent = "Update note";
  noteForm.hidden = false;
  setSidebarExpanded(true);
  noteText.focus();
}

function closeForm() {
  editingNoteId = null;
  pendingCoord = null;
  noteForm.hidden = true;
  pendingMarker.hidden = true;
  clearImage();
  setSidebarExpanded(false);
}

function clearImage() {
  pendingImageDataUrl = "";
  noteImageInput.value = "";
  noteImagePreview.hidden = true;
  noteImagePreviewImg.src = "";
}

noteImageInput.addEventListener("change", async () => {
  const file = noteImageInput.files && noteImageInput.files[0];
  if (!file) return;
  try {
    pendingImageDataUrl = await imageFileToDataUrl(file);
    noteImagePreviewImg.src = pendingImageDataUrl;
    noteImagePreview.hidden = false;
  } catch (err) {
    showError(err.message || "Couldn't process that image.");
    clearImage();
  }
});
noteImageRemoveBtn.addEventListener("click", clearImage);

noteCancelBtn.addEventListener("click", closeForm);

function showError(msg) {
  noteError.textContent = msg;
  noteError.hidden = false;
}

noteCommitBtn.addEventListener("click", async () => {
  if (!pendingCoord || !currentViewId) return;
  const text = noteText.value.trim();
  if (!text && !pendingImageDataUrl) {
    showError("Add some text or attach an image first.");
    return;
  }

  const wasEditing = Boolean(editingNoteId);
  noteCommitBtn.disabled = true;
  noteCommitBtn.textContent = wasEditing ? "Updating…" : "Saving…";
  noteError.hidden = true;

  try {
    if (wasEditing) {
      const updated = await updateNote(editingNoteId, { text, image: pendingImageDataUrl });
      const idx = committedNotes.findIndex((n) => n.id === updated.id);
      if (idx >= 0) committedNotes[idx] = updated;
      else committedNotes.push(updated);
      if (viewer) viewer.removeHotSpot(`note-${updated.id}`);
      addHotspotToViewer(updated);
      renderNoteList();
      closeForm();
    } else {
      const saved = await submitNote({
        view: currentViewId,
        pitch: pendingCoord.pitch,
        yaw: pendingCoord.yaw,
        text,
        image: pendingImageDataUrl,
      });
      committedNotes.push(saved);
      addHotspotToViewer(saved);
      renderNoteList();
      closeForm();
    }
  } catch (err) {
    console.error(err);
    showError(
      wasEditing
        ? "Couldn't update the note. Check that the Worker in js/notes-config.js is reachable."
        : "Couldn't save the note. Check that the Worker URL in js/notes-config.js is correct and running."
    );
  } finally {
    noteCommitBtn.disabled = false;
    noteCommitBtn.textContent = wasEditing ? "Update note" : "Save note";
  }
});

/* ---------- Hapus catatan (dipicu dari modal) ---------- */

async function handleDeleteNote(note) {
  try {
    await deleteNote(note.id);
    if (viewer) viewer.removeHotSpot(`note-${note.id}`);
    committedNotes = committedNotes.filter((n) => n.id !== note.id);
    if (editingNoteId === note.id) closeForm();
    renderNoteList();
  } catch (err) {
    console.error(err);
    showError(err.message || "Couldn't delete the note.");
  }
}

/* ---------- Render icon 💬 permanen ke viewer ---------- */

function addHotspotToViewer(note) {
  if (!viewer || note.view !== currentViewId) return;
  viewer.addHotSpot({
    id: `note-${note.id}`,
    pitch: note.pitch,
    yaw: note.yaw,
    type: "info",
    cssClass: "note-hotspot",
    createTooltipFunc: createNoteHotspotEl,
    createTooltipArgs: { label: "", showLabel: false },
    clickHandlerFunc: () => {
      openNoteModal(note, {
        editable: true,
        onEdit: () => openEditNoteForm(note),
        onDelete: () => handleDeleteNote(note),
      });
    },
  });
}

/** Saat pindah/reload gambar 360, tampilkan lagi catatan yang sudah ada
 * untuk view itu — gabungan dari data sesi ini (diprioritaskan, supaya
 * hasil edit terbaru tampil) + data server (fetchNotes). */
async function renderCommittedHotspotsForCurrentView() {
  const serverNotes = await fetchNotes();
  const sessionNotes = committedNotes.filter((n) => n.view === currentViewId);
  const seen = new Set();
  [...sessionNotes, ...serverNotes].forEach((n) => {
    if (n.view !== currentViewId || seen.has(n.id)) return;
    seen.add(n.id);
    addHotspotToViewer(n);
  });
}

/* ---------- Daftar catatan dibuat/diedit sesi ini (sidebar) ---------- */

function renderNoteList() {
  noteList.innerHTML = "";
  noteListEmpty.style.display = committedNotes.length === 0 ? "block" : "none";
  committedNotes.forEach((n) => {
    const row = document.createElement("div");
    row.className = "note-row";
    row.innerHTML = `
      ${n.image ? `<img src="${n.image}" alt="" />` : ""}
      <span class="note-row-text">${n.view} — ${n.text || "(image only)"}</span>
    `;
    noteList.appendChild(row);
  });
}
