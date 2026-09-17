/**
 * ============================================================
 *  notes-list.js — panel "Notes" (bottom-left) di tur utama
 * ============================================================
 * Menampilkan seluruh catatan hotspot (dari semua gambar 360,
 * bukan cuma yang sedang dibuka) dalam 1 panel kecil yang bisa
 * di-hide/show, mirip pola floorplan-panel. Klik 1 catatan ->
 * viewer otomatis pindah ke scene + pitch/yaw tempat catatan itu
 * ditulis (viewer.loadScene(view, pitch, yaw)).
 *
 * Fitur ini SEPENUHNYA dikendalikan oleh `notesEnabled` di
 * content.js. Kalau false: panel + tombol toggle-nya dihapus dari
 * DOM, dan fetchNotes() tidak pernah dipanggil — project ini tidak
 * perlu Worker/KV Cloudflare sama sekali.
 * ============================================================
 */
import { findView, notesEnabled } from "./content.js";
import { fetchNotes } from "./notes-api.js";
import { viewer } from "./viewer.js";

const panel = document.getElementById("notes-list-panel");
const showBtn = document.getElementById("notes-list-show-btn");

if (!notesEnabled) {
  panel?.closest(".notes-nav-panel")?.remove();
} else {
  initNotesList();
}

function initNotesList() {
  const hideBtn = document.getElementById("notes-list-hide-btn");
  const printBtn = document.getElementById("notes-list-print-btn");
  const listBody = document.getElementById("notes-list-body");

  // Menyimpan hasil render terakhir (sudah difilter, diurutkan lama->baru,
  // dan diberi nomor) supaya tombol Print memakai data + urutan + nomor
  // yang PERSIS sama dengan yang terlihat di panel — bukan fetch ulang.
  let renderedNotes = [];

  /* ---------- Sembunyikan / tampilkan panel ----------
     Icon di rail (showBtn) TIDAK ikut disembunyikan lagi saat panel
     terbuka — dibiarkan selalu tampil dan berfungsi sebagai toggle,
     supaya perilakunya konsisten dengan icon lain di rail (share,
     bahasa): klik sekali buka, klik lagi tutup. Tombol X di dalam
     panel (hideBtn) tetap ada sebagai cara alternatif untuk menutup. */

  hideBtn.addEventListener("click", () => {
    panel.classList.add("hidden");
  });
  showBtn.addEventListener("click", () => {
    panel.classList.toggle("hidden");
  });

  /* ---------- Render daftar catatan ---------- */

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  function noteSummary(note) {
    if (note.text) return escapeHtml(note.text);
    if (note.image) return "📷 Photo note";
    return "(empty note)";
  }

  function renderList(notes) {
    listBody.innerHTML = "";

    const valid = notes.filter((n) => n && n.view && findView(n.view));

    if (!valid.length) {
      renderedNotes = [];
      listBody.innerHTML = `<p class="notes-list-empty">No notes yet.</p>`;
      if (printBtn) printBtn.disabled = true;
      return;
    }

    // Urutan lama -> baru, supaya catatan terbaru berada di paling
    // akhir daftar (memudahkan cek catatan baru tanpa harus scroll
    // dari atas tiap kali ada catatan masuk).
    renderedNotes = valid.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    if (printBtn) printBtn.disabled = false;

    renderedNotes.forEach((note, i) => {
      const v = findView(note.view);
      const item = document.createElement("button");
      item.type = "button";
      item.className = "notes-list-item";
      item.innerHTML = `
        <span class="notes-list-item-head">
          <span class="notes-list-item-number">${i + 1}</span>
          <span class="notes-list-item-view">${escapeHtml(v.title)}</span>
        </span>
        <span class="notes-list-item-text">${noteSummary(note)}</span>
      `;
      item.addEventListener("click", () => {
        viewer.loadScene(note.view, note.pitch, note.yaw);
      });
      listBody.appendChild(item);
    });
  }

  /* ---------- Print daftar catatan ---------- */

  function formatTimestamp(ms) {
    if (!ms) return "—";
    try {
      return new Date(ms).toLocaleString("ja-JP", {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit",
      });
    } catch {
      return "—";
    }
  }

  function buildPrintDocument(notes) {
    const generatedAt = new Date().toLocaleString("ja-JP", {
      year: "numeric", month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
    const siteTitle = document.title.split("|")[0].trim() || "Virtual Tour";

    const items = notes.map((note, i) => {
      const v = findView(note.view);
      const text = note.text
        ? `<p class="pn-text">${escapeHtml(note.text).replace(/\n/g, "<br>")}</p>`
        : (!note.image ? `<p class="pn-text pn-empty">(内容なし)</p>` : "");
      const image = note.image
        ? `<img class="pn-photo" src="${note.image}" alt="メモ ${i + 1} の添付写真 — ${escapeHtml(v.title)}">`
        : "";
      return `
        <section class="pn-item">
          <div class="pn-item-head">
            <span class="pn-no">${i + 1}</span>
            <span class="pn-view">${escapeHtml(v.title)}</span>
            <span class="pn-date">${formatTimestamp(note.createdAt)}</span>
          </div>
          ${text}
          ${image}
        </section>
      `;
    }).join("");

    return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>メモ一覧 — ${escapeHtml(siteTitle)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 0 4mm;
    font-family: "Segoe UI", Helvetica, Arial, sans-serif;
    color: #1a1a1a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .pn-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    border-bottom: 2px solid #1a1a1a;
    padding-bottom: 10px;
    margin-bottom: 6px;
  }
  .pn-header h1 {
    margin: 0 0 4px 0;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.01em;
  }
  .pn-header .pn-subtitle {
    margin: 0;
    font-size: 11px;
    color: #555;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .pn-meta {
    text-align: right;
    font-size: 10.5px;
    color: #555;
    line-height: 1.5;
    white-space: nowrap;
  }

  /* ---- 1 catatan = 1 blok, urut dari atas ke bawah ---- */
  .pn-item {
    padding: 12px 0;
    border-bottom: 1px solid #ddd;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .pn-item:last-child { border-bottom: none; }
  .pn-item-head {
    display: flex;
    align-items: center;
    gap: 9px;
    margin-bottom: 6px;
  }
  .pn-no {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #1a1a1a;
    color: #fff;
    font-size: 10.5px;
    font-weight: 700;
  }
  .pn-view {
    flex: 1 1 auto;
    font-weight: 700;
    text-transform: uppercase;
    font-size: 11.5px;
    letter-spacing: 0.04em;
    color: #1a1a1a;
  }
  .pn-date {
    flex: 0 0 auto;
    font-size: 10.5px;
    color: #666;
    white-space: nowrap;
  }
  .pn-text {
    margin: 0 0 8px 29px;
    font-size: 12.5px;
    line-height: 1.55;
    max-width: 90%;
  }
  .pn-empty { color: #888; font-style: italic; }

  /* Foto ditampilkan utuh (bukan thumbnail), lebar setengah halaman
     A4 supaya tetap proporsional & tidak memenuhi halaman. */
  .pn-photo {
    display: block;
    margin: 0 0 0 29px;
    width: 50%;
    height: auto;
    border: 1px solid #ccc;
    border-radius: 4px;
  }

  .pn-footer {
    margin-top: 18px;
    padding-top: 10px;
    border-top: 1px solid #ddd;
    font-size: 9.5px;
    color: #999;
    text-align: center;
  }

  @page { size: A4; margin: 14mm; }
</style>
</head>
<body>
  <div class="pn-header">
    <div>
      <h1>${escapeHtml(siteTitle)}</h1>
      <p class="pn-subtitle">ホットスポット メモ一覧</p>
    </div>
    <div class="pn-meta">
      印刷日時: ${generatedAt}<br>
      メモ総数: ${notes.length}件
    </div>
  </div>
  ${items}
  <p class="pn-footer">Notesパネルより自動生成 — ${escapeHtml(siteTitle)}</p>
</body>
</html>`;
  }

  function printNotesList() {
    if (!renderedNotes.length) return;

    // Print lewat iframe tersembunyi (bukan window.open) supaya tidak
    // kena popup-blocker dan tidak perlu tab baru — konten dibuang
    // otomatis setelah dialog print ditutup.
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);

    const cleanup = () => {
      setTimeout(() => iframe.remove(), 500);
    };

    iframe.onload = () => {
      const win = iframe.contentWindow;
      win.focus();
      win.print();
    };
    iframe.contentWindow.addEventListener("afterprint", cleanup, { once: true });
    // Fallback kalau event "afterprint" tidak fire di browser tertentu.
    setTimeout(cleanup, 15000);

    const doc = iframe.contentDocument;
    doc.open();
    doc.write(buildPrintDocument(renderedNotes));
    doc.close();
  }

  if (printBtn) {
    printBtn.disabled = true;
    printBtn.addEventListener("click", printNotesList);
  }

  fetchNotes().then(renderList);
}
