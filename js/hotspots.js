/**
 * ============================================================
 *  hotspots.js — tampilan titik di dalam gambar 360
 * ============================================================
 * Dua fungsi murni tampilan, dipakai oleh viewer.js:
 *   - createNavHotspotEl     -> titik yang berpindah ke view lain
 *                                (panah, tampilan lama).
 *   - createContentHotspotEl -> titik yang membuka jendela content
 *                                (foto/link/video/embed) — ikon
 *                                lebih kecil & berkedip lebih cepat
 *                                supaya beda dari titik navigasi.
 *
 * Keduanya menerima argumen objek { label, showLabel }:
 *   label     : teks yang ditampilkan di bawah ikon.
 *   showLabel : false = ikon saja, teks disembunyikan sama sekali.
 * (Field ini diatur dari js/content.js lewat pitchPoints.label /
 * pitchPoints.showLabel — lihat komentar di content.js.)
 * ============================================================ */

function normalizeArgs(args) {
  // Kompatibilitas mundur: kalau args berupa string biasa (format
  // lama), anggap itu sebagai label dengan showLabel default true.
  if (typeof args === "string") return { label: args, showLabel: true };
  const { label = "", showLabel = true } = args || {};
  return { label, showLabel };
}

export function createNavHotspotEl(hotSpotDiv, args) {
  const { label, showLabel } = normalizeArgs(args);
  hotSpotDiv.classList.add("nav-hotspot-inner");
  hotSpotDiv.innerHTML = `
    <span class="nav-hotspot-ring">
      <svg class="nav-hotspot-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 19V5M5 12l7-7 7 7"/>
      </svg>
    </span>
    ${showLabel && label ? `<span class="nav-hotspot-label">${label}</span>` : ""}
  `;
}

export function createContentHotspotEl(hotSpotDiv, args) {
  const { label, showLabel } = normalizeArgs(args);
  hotSpotDiv.classList.add("content-hotspot-inner");
  hotSpotDiv.setAttribute("role", "button");
  hotSpotDiv.setAttribute("tabindex", "0");
  hotSpotDiv.setAttribute("aria-label", label || "See more information");
  hotSpotDiv.innerHTML = `
    <span class="content-hotspot-ring">
      <svg class="content-hotspot-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 7v10M7 12h10"/>
      </svg>
    </span>
    ${showLabel && label ? `<span class="content-hotspot-label">${label}</span>` : ""}
  `;
  // Aksesibilitas: pannellum cuma memasang listener "click" untuk
  // clickHandlerFunc, jadi Enter/Space di keyboard belum otomatis
  // memicu klik pada <div role="button">. Ditambahkan manual di sini.
  hotSpotDiv.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      hotSpotDiv.click();
    }
  });
}

/**
 * createNoteHotspotEl — ikon 💬 untuk "Catatan Hotspot" buatan
 * pengunjung (disimpan lewat note-finder.html, ditampilkan lewat
 * viewer.js). Dipisah dari createContentHotspotEl supaya gampang
 * dibedakan gaya visualnya (warna beda, lihat .note-hotspot di
 * style.css) walau strukturnya mirip.
 */
export function createNoteHotspotEl(hotSpotDiv, args) {
  const { label, showLabel } = normalizeArgs(args);
  hotSpotDiv.classList.add("note-hotspot-inner");
  hotSpotDiv.setAttribute("role", "button");
  hotSpotDiv.setAttribute("tabindex", "0");
  hotSpotDiv.setAttribute("aria-label", label || "View note");
  hotSpotDiv.innerHTML = `
    <span class="note-hotspot-ring">
      <svg class="note-hotspot-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
      </svg>
    </span>
    ${showLabel && label ? `<span class="note-hotspot-label">${label}</span>` : ""}
  `;
  hotSpotDiv.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      hotSpotDiv.click();
    }
  });
}
