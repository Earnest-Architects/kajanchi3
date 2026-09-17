/**
 * ============================================================
 *  content-modal.js — jendela pop-up untuk hotspot content
 * ============================================================
 * Dibuka saat sebuah hotspot bertipe "content" (lihat content.js)
 * diklik. Jendela ini dibangun sekali saja (lazy, saat pertama
 * kali dibutuhkan) lalu dipakai ulang untuk semua content.
 *
 * Mendukung 6 tipe content (lihat dokumentasi di content.js):
 *   "photo", "icon-link", "text-link", "link", "youtube", "embed".
 *
 * Fungsi yang dipakai file lain:
 *   openContentModal(id)  — buka jendela untuk 1 id di array `contents`.
 *   closeContentModal()   — tutup jendela yang sedang terbuka.
 * ============================================================ */
import { findContent } from "./content.js";

let overlay = null;
let modalEl = null;
let titleEl = null;
let bodyEl = null;
let footerEl = null;
let expandBtn = null;
let closeBtn = null;
let closeTimer = null;
let footerClickHandler = null;

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function extractYouTubeId(url) {
  if (!url) return "";
  const m = String(url).match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/
  );
  return m ? m[1] : "";
}

function renderBody(c) {
  switch (c.type) {
    case "photo":
      return `
        <div class="content-modal-photo">
          <img src="${escapeHtml(c.image)}" alt="${escapeHtml(c.title || "")}" />
        </div>
        ${c.text ? `<p class="content-modal-text">${escapeHtml(c.text)}</p>` : ""}
      `;

    case "icon-link":
      return `
        <div class="content-modal-icon-link">
          ${c.image ? `<img class="content-modal-icon-img" src="${escapeHtml(c.image)}" alt="" />` : ""}
          ${c.text ? `<p class="content-modal-text">${escapeHtml(c.text)}</p>` : ""}
          ${c.link ? `<a class="content-modal-link-btn" href="${escapeHtml(c.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(c.linkLabel || "Open link")}</a>` : ""}
        </div>
      `;

    case "text-link":
      return `
        <div class="content-modal-text-link">
          ${c.text ? `<p class="content-modal-text">${escapeHtml(c.text)}</p>` : ""}
          ${c.link ? `<a class="content-modal-link-btn" href="${escapeHtml(c.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(c.linkLabel || "Open link")}</a>` : ""}
        </div>
      `;

    case "link":
      return c.link
        ? `<a class="content-modal-link-btn content-modal-link-btn--solo" href="${escapeHtml(c.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(c.linkLabel || c.link)}</a>`
        : `<p class="content-modal-text">Link not set yet.</p>`;

    case "youtube": {
      const id = extractYouTubeId(c.youtubeUrl);
      if (!id) return `<p class="content-modal-text">Invalid YouTube link.</p>`;
      return `
        <div class="content-modal-video">
          <iframe
            src="https://www.youtube-nocookie.com/embed/${id}"
            title="${escapeHtml(c.title || "Video")}"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
            loading="lazy"
          ></iframe>
        </div>
      `;
    }

    case "embed":
      return `<div class="content-modal-embed">${c.embedHtml || ""}</div>`;

    default:
      return `<p class="content-modal-text">Unknown content type.</p>`;
  }
}

function buildModal() {
  if (overlay) return;

  overlay = document.createElement("div");
  overlay.className = "content-modal-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="content-modal" role="dialog" aria-modal="true" aria-labelledby="content-modal-title">
      <div class="content-modal-header">
        <h2 class="content-modal-title" id="content-modal-title"></h2>
        <div class="content-modal-actions">
          <button type="button" class="content-modal-btn" id="content-modal-expand-btn" aria-label="Expand" title="Expand">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/>
            </svg>
          </button>
          <button type="button" class="content-modal-btn" id="content-modal-close-btn" aria-label="Close" title="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="content-modal-body" id="content-modal-body"></div>
      <div class="content-modal-footer" id="content-modal-footer" hidden></div>
    </div>
  `;
  document.body.appendChild(overlay);

  modalEl = overlay.querySelector(".content-modal");
  titleEl = overlay.querySelector("#content-modal-title");
  bodyEl = overlay.querySelector("#content-modal-body");
  footerEl = overlay.querySelector("#content-modal-footer");
  expandBtn = overlay.querySelector("#content-modal-expand-btn");
  closeBtn = overlay.querySelector("#content-modal-close-btn");

  footerEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (btn && footerClickHandler) footerClickHandler(btn.dataset.action);
  });

  closeBtn.addEventListener("click", closeContentModal);
  expandBtn.addEventListener("click", () => {
    modalEl.classList.toggle("content-modal--expanded");
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeContentModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay && !overlay.hidden) closeContentModal();
  });
}

export function openContentModal(id) {
  const c = findContent(id);
  if (!c) return;

  buildModal();
  clearTimeout(closeTimer);

  titleEl.textContent = c.title || "";
  bodyEl.innerHTML = renderBody(c);
  footerEl.hidden = true;
  footerEl.innerHTML = "";
  footerClickHandler = null;
  modalEl.classList.remove("content-modal--expanded");
  overlay.hidden = false;

  // Beri browser 1 frame untuk apply "hidden = false" dulu, baru
  // tambah class transisi, supaya animasi muncul benar-benar jalan.
  requestAnimationFrame(() => overlay.classList.add("visible"));
}

/**
 * openCustomModal — versi generik dari openContentModal, dipakai
 * oleh note-view.js untuk menampilkan isi 1 catatan hotspot
 * (teks + gambar) tanpa perlu lewat array `contents` di content.js,
 * karena data catatan datang dari Worker Cloudflare (dinamis, bukan
 * dari content.js yang statis).
 *
 * @param {string} title
 * @param {string} bodyHtml
 * @param {{footerHtml?: string, onFooterClick?: (action: string) => void}} [options]
 *   footerHtml   — HTML tambahan di bawah body, biasanya tombol
 *                  aksi dengan atribut data-action="...".
 *   onFooterClick — dipanggil dengan value data-action saat salah
 *                  satu elemen di footerHtml diklik.
 */
export function openCustomModal(title, bodyHtml, options = {}) {
  const { footerHtml = "", onFooterClick = null } = options;

  buildModal();
  clearTimeout(closeTimer);

  titleEl.textContent = title || "";
  bodyEl.innerHTML = bodyHtml || "";
  footerEl.innerHTML = footerHtml;
  footerEl.hidden = !footerHtml;
  footerClickHandler = onFooterClick;
  modalEl.classList.remove("content-modal--expanded");
  overlay.hidden = false;

  requestAnimationFrame(() => overlay.classList.add("visible"));
}

export function closeContentModal() {
  if (!overlay || overlay.hidden) return;
  overlay.classList.remove("visible");
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    overlay.hidden = true;
    // Kosongkan body supaya video/embed yang sedang main berhenti.
    bodyEl.innerHTML = "";
  }, 250);
}
