/**
 * ============================================================
 *  viewer.js — CORE VIEWER
 * ============================================================
 * Membungkus instance Pannellum. Membangun konfigurasi scene
 * langsung dari data di content.js — kalau content.js bertambah
 * atau berkurang isinya, viewer ini otomatis menyesuaikan tanpa
 * perlu diedit sama sekali.
 * ============================================================
 */
import { views, findView, findContent, projectName, metaDescription, notesEnabled } from "./content.js";
import { createNavHotspotEl, createContentHotspotEl, createNoteHotspotEl } from "./hotspots.js";
import { openContentModal } from "./content-modal.js";
import { openNoteModal } from "./note-view.js";
import { fetchNotes } from "./notes-api.js";
import { setCurrentView, getCurrentViewId, tourEvents } from "./state.js";

/* ---------- Judul halaman (tab browser), judul besar HUD, meta
   description, & tag Open Graph/Twitter (preview link sosmed) ----------
   Satu-satunya sumber datanya adalah `projectName` & `metaDescription`
   di content.js — ganti nilainya di sana, semua ikut berubah otomatis.
   (Catatan: sebagian besar crawler preview link sosmed seperti
   WhatsApp/Facebook/Twitter TIDAK menjalankan JavaScript, jadi untuk
   preview link yang 100% akurat, tag og:title/og:description statis
   di index.html tetap perlu disamakan manual. Bagian ini tetap berguna
   untuk judul tab browser & crawler yang menjalankan JS seperti Google.) */
const fullTitle = `${projectName} Virtual Tour | rinaldisign`;
document.title = fullTitle;

const projectTitleEl = document.getElementById("project-title");
if (projectTitleEl) projectTitleEl.textContent = `${projectName} Virtual Tour`;

function setMetaContent(selector, content) {
  const el = document.querySelector(selector);
  if (el) el.setAttribute("content", content);
}
setMetaContent('meta[name="description"]', metaDescription);
setMetaContent('meta[property="og:title"]', `${projectName} Virtual Tour`);
setMetaContent('meta[property="og:description"]', metaDescription);
setMetaContent('meta[name="twitter:title"]', `${projectName} Virtual Tour`);
setMetaContent('meta[name="twitter:description"]', metaDescription);

export const viewer = pannellum.viewer("panorama", {
  default: {
    firstScene: views[0].id,
    sceneFadeDuration: 600,
    autoLoad: true,
    showControls: false,
    compass: false,
    hfov: 100,
  },
  scenes: Object.fromEntries(
    views.map((v) => [
      v.id,
      {
        type: "equirectangular",
        panorama: v.image,
        autoLoad: true,
        yaw: v.yawOffset || 0,
        hotSpots: (v.pitchPoints || []).map((p) => {
          const showLabel = p.showLabel !== false;

          if (p.type === "content") {
            const c = findContent(p.target);
            const label = p.label || (c || {}).title || "";
            return {
              pitch: p.pitch,
              yaw: p.yaw,
              type: "content-point",
              cssClass: "content-hotspot",
              createTooltipFunc: createContentHotspotEl,
              createTooltipArgs: { label, showLabel },
              clickHandlerFunc: () => openContentModal(p.target),
            };
          }

          const label = p.label || (findView(p.target) || {}).title || "";
          return {
            pitch: p.pitch,
            yaw: p.yaw,
            type: "scene",
            sceneId: p.target,
            cssClass: "nav-hotspot",
            createTooltipFunc: createNavHotspotEl,
            createTooltipArgs: { label, showLabel },
          };
        }),
      },
    ])
  ),
});

/* ---------- Catatan Hotspot (dibuat pengunjung lewat note-finder.html) ----------
   Berbeda dari pitchPoints di content.js (statis, ditulis manual di
   kode), catatan disimpan dinamis lewat Worker Cloudflare. Diambil
   sekali saat halaman dibuka, lalu ditempel ke scene yang sesuai
   pakai viewer.addHotSpot() — pannellum otomatis menyimpannya untuk
   scene yang belum aktif dan menampilkannya begitu scene itu dibuka.

   Fitur ini SEPENUHNYA dikendalikan oleh `notesEnabled` di content.js.
   Kalau false: icon 💬 "Leave a note" disembunyikan dan fetchNotes()
   tidak pernah dipanggil — project ini tidak perlu Worker/KV Cloudflare
   sama sekali. */
if (notesEnabled) {
  fetchNotes().then((notes) => {
    notes.forEach((note) => {
      if (!note || !note.view || !findView(note.view)) return; // abaikan catatan untuk view yang sudah dihapus
      viewer.addHotSpot(
        {
          id: `note-${note.id}`,
          pitch: note.pitch,
          yaw: note.yaw,
          type: "info",
          cssClass: "note-hotspot",
          createTooltipFunc: createNoteHotspotEl,
          createTooltipArgs: { label: "", showLabel: false },
          clickHandlerFunc: () => openNoteModal(note),
        },
        note.view
      );
    });
  });
} else {
  document.getElementById("note-btn")?.remove();
}

/** Pindah ke view lain. Dipakai floorplan.js (klik titik di denah). */
export function goToView(id) {
  if (!id) return;
  viewer.loadScene(id);
}

/* ---------- Nama ruangan (eyebrow kecil di atas judul project) ---------- */

const sceneTitleEl = document.getElementById("scene-title");

function updateTitle(id) {
  const v = findView(id);
  if (v && sceneTitleEl) sceneTitleEl.textContent = v.title;
}

/* ---------- Loading screen ----------
   Animasi brand "Earnest Architects" butuh waktu untuk tampil penuh
   dengan mulus, jadi loading screen ditahan minimal MIN_LOADING_MS
   walaupun panorama sudah selesai dimuat lebih cepat dari itu. */

const loadingScreen = document.getElementById("loading-screen");
const MIN_LOADING_MS = 1700;
const loadingStartedAt = performance.now();

function hideLoadingScreen() {
  loadingScreen.classList.add("hidden");
  tourEvents.emit("viewerload", { id: viewer.getScene() });
}

viewer.on("load", () => {
  const elapsed = performance.now() - loadingStartedAt;
  const remaining = Math.max(0, MIN_LOADING_MS - elapsed);
  setTimeout(hideLoadingScreen, remaining);
});

viewer.on("scenechange", (id) => {
  setCurrentView(id);
  updateTitle(id);
});

/* ---------- Fullscreen control ---------- */

const fullscreenBtn = document.getElementById("fullscreen-btn");

const supportsFullscreen =
  document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;

if (!supportsFullscreen) {
  // iPhone (iOS Safari & semua browser di iOS) belum mendukung Fullscreen API
  // untuk elemen selain <video>, jadi tombolnya disembunyikan saja.
  fullscreenBtn.style.display = "none";
} else {
  fullscreenBtn.addEventListener("click", () => viewer.toggleFullscreen());
}

/* ---------- Tombol VR (buka viewer VR di vr.html) ---------- */
/* Membawa scene yang sedang dilihat lewat ?scene=..., supaya begitu
   masuk mode VR, pengguna melanjutkan dari ruangan yang sama. */

const vrBtn = document.getElementById("vr-btn");

if (vrBtn) {
  vrBtn.addEventListener("click", () => {
    const id = getCurrentViewId() || views[0].id;
    window.location.href = `vr.html?scene=${encodeURIComponent(id)}`;
  });
}

/* ---------- Share (copy link / native share) ---------- */

const shareBtn = document.getElementById("share-btn");
const toastEl = document.getElementById("toast");

let toastTimer = null;
function showToast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("visible"), 2400);
}

async function copyLinkFallback(url) {
  const input = document.createElement("textarea");
  input.value = url;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  try {
    document.execCommand("copy");
    return true;
  } catch (err) {
    return false;
  } finally {
    document.body.removeChild(input);
  }
}

async function copyLink() {
  const url = window.location.href;
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied");
      return;
    } catch (err) {
      /* lanjut ke fallback di bawah */
    }
  }
  const ok = await copyLinkFallback(url);
  showToast(ok ? "Link copied" : "Copy failed");
}

const sharePopup = document.getElementById("share-popup");
const shareQrCanvas = document.getElementById("share-qr-canvas");
const shareLinkText = document.getElementById("share-link-text");
const shareCopyBtn = document.getElementById("share-copy-btn");
const shareNativeBtn = document.getElementById("share-native-btn");

function renderShareQr(url) {
  if (!shareQrCanvas) return;
  if (!window.qrcodeDraw) {
    console.error("[share] window.qrcodeDraw tidak tersedia — cek apakah lib/qrcode.js berhasil dimuat.");
    return;
  }
  const opts = { size: 188, margin: 2, dark: "#0b0f18", light: "#ffffff" };
  try {
    // Coba level koreksi "M" dulu (standar).
    window.qrcodeDraw(shareQrCanvas, url, { ...opts, ecLevel: "M" });
  } catch (errM) {
    try {
      // Kalau gagal (paling sering karena link terlalu panjang untuk level M),
      // turunkan ke level "L" — koreksi error lebih rendah tapi daya tampung
      // datanya lebih besar, jadi link yang lebih panjang masih bisa di-encode.
      window.qrcodeDraw(shareQrCanvas, url, { ...opts, ecLevel: "L" });
      console.warn("[share] QR di-render dengan ecLevel L (fallback) karena level M gagal:", errM);
    } catch (errL) {
      // Masih gagal juga — kemungkinan besar link memang terlalu panjang
      // untuk QR sama sekali. Jangan biarkan kartu kosong tanpa penjelasan.
      console.error("[share] Gagal membuat QR code untuk link ini:", errL);
      const ctx = shareQrCanvas.getContext("2d");
      ctx.clearRect(0, 0, shareQrCanvas.width, shareQrCanvas.height);
      ctx.fillStyle = "#0b0f18";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Link terlalu panjang", shareQrCanvas.width / 2, shareQrCanvas.height / 2 - 8);
      ctx.fillText("untuk QR code", shareQrCanvas.width / 2, shareQrCanvas.height / 2 + 8);
    }
  }
}
function closeSharePopup() {
  if (!sharePopup || sharePopup.hidden) return;
  sharePopup.hidden = true;
  shareBtn.classList.remove("is-active");
}
function openSharePopup() {
  if (!sharePopup) return;
  const url = window.location.href;
  if (shareLinkText) shareLinkText.textContent = url;
  renderShareQr(url);
  sharePopup.hidden = false;
  shareBtn.classList.add("is-active");
}
if (shareCopyBtn) shareCopyBtn.addEventListener("click", copyLink);
if (shareNativeBtn) {
  if (navigator.share) {
    shareNativeBtn.addEventListener("click", async () => {
      try {
        await navigator.share({ title: document.title, text: `${projectName} Virtual Tour`, url: window.location.href });
      } catch (err) {
        /* dibatalkan pengguna — diamkan */
      }
    });
  } else {
    shareNativeBtn.remove();
  }
}
document.addEventListener("click", (e) => {
  if (sharePopup && !sharePopup.hidden && !e.target.closest(".share-nav")) closeSharePopup();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSharePopup();
});

if (shareBtn) {
  shareBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (sharePopup) {
      sharePopup.hidden ? openSharePopup() : closeSharePopup();
    } else {
      copyLink();
    }
  });
}

/* ---------- Inisialisasi view pertama ---------- */
setCurrentView(views[0].id);
updateTitle(views[0].id);
