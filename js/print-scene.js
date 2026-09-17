/**
 * ============================================================
 *  print-scene.js — print tombol "Print this view"
 * ============================================================
 * Ambil frame yang sedang tampil di canvas WebGL Pannellum persis
 * pada sudut pandang saat itu, lalu buka tab baru berisi halaman
 * print-ready: full-bleed, landscape — @page tidak mengunci ukuran
 * kertas, jadi otomatis mengikuti kertas apapun yang dipilih user
 * di print dialog (A4, A3, dst), foto selalu full-bleed.
 *
 * Pojok kiri-bawah: "Image CG"; pojok kanan-bawah: nama ruangan
 * (diambil dari #scene-title, yang sudah dikelola viewer.js).
 * Keduanya pakai font Monotype Corsiva, ukuran kecil.
 * ============================================================ */
import { viewer } from "./viewer.js";

const printBtn = document.getElementById("print-scene-btn");

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function captureCurrentFrame() {
  const canvas = viewer.getRenderer().getCanvas();
  return canvas.toDataURL("image/jpeg", 0.95);
}

function openPrintPage(imageDataUrl, roomName) {
  const win = window.open("", "_blank");
  if (!win) return; // popup diblokir browser — gagal secara diam-diam, tombol lain tetap jalan

  // Font custom (NK_Mono.ttf) di-resolve ke URL absolut dari lokasi
  // halaman utama, karena dokumen di tab print ini kosong (about:blank)
  // dan tidak punya origin sendiri untuk resolve path relatif.
  const fontUrl = new URL("fonts/NK_Mono.ttf", window.location.href).href;

  win.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>Print — ${escapeHtml(roomName)}</title>
<style>
  @font-face {
    font-family: "NK Mono";
    src: url("${fontUrl}") format("truetype");
    font-display: block;
  }
  @page { size: landscape; margin: 2mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    width: 100%;
    height: 100vh;
    position: relative;
    overflow: hidden;
  }
  .print-photo {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .print-stamp {
    position: absolute;
    bottom: 3mm;
    font-family: "NK Mono", "Monotype Corsiva", cursive;
    font-size: 12pt;
    color: #ffffff !important;
    -webkit-text-fill-color: #ffffff;
    text-shadow: 0 0 2px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.6);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    z-index: 2;
  }
  .print-stamp--left { left: 5mm; }
  .print-stamp--right { right: 5mm; text-align: right; }
  @media screen {
    body { background: #666; display: flex; align-items: center; justify-content: center; }
    .print-page {
      width: 297mm; height: 210mm;
      position: relative;
      background: #fff;
      box-shadow: 0 4px 24px rgba(0,0,0,0.4);
      overflow: hidden;
    }
    .print-photo, .print-stamp { position: absolute; }
  }
</style>
</head>
<body>
  <div class="print-page">
    <img class="print-photo" src="${imageDataUrl}" alt="" />
    <span class="print-stamp print-stamp--left">Image CG</span>
    <span class="print-stamp print-stamp--right">${escapeHtml(roomName)}</span>
  </div>
  <script>
    window.onload = function () {
      var ready = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
      ready.then(function () {
        window.focus();
        window.print();
      });
    };
  <\/script>
</body>
</html>`);
  win.document.close();
}

if (printBtn) {
  printBtn.addEventListener("click", () => {
    try {
      const imageDataUrl = captureCurrentFrame();
      const roomName = document.getElementById("scene-title")?.textContent?.trim() || "";
      openPrintPage(imageDataUrl, roomName);
    } catch (err) {
      console.error("Print scene failed:", err);
    }
  });
}
