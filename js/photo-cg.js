/**
 * ============================================================
 *  photo-cg.js — jendela "3D Carousel" (fitur Photos)
 * ============================================================
 * Dibuka lewat tombol ikon galeri di icon-rail kiri-bawah.
 * Menampilkan foto-foto dari array `photoCG` (js/content.js)
 * dalam bentuk 3D carousel (foto tengah besar, foto kiri/kanan
 * lebih kecil & miring).
 *
 * Efek:
 *   - Opening : overlay + foto fade-in opacity 0% -> 100%, 3 detik.
 *   - Closing : kebalikan dari opening (fade-out 3 detik).
 *   - Klik foto tengah -> load view 360 tujuan LANGSUNG (di
 *     belakang overlay, jadi sudah siap saat overlay terbuka),
 *     lalu foto di-zoom + layar menggelap perlahan (3 detik)
 *     sebelum overlay ditutup, hasilnya transisi terasa smooth
 *     tanpa "patah".
 * ============================================================ */
import { photoCG } from "./content.js";
import { goToView } from "./viewer.js";

const OPEN_CLOSE_MS = 2000; // durasi opening/closing overlay
const NAV_MS = 650;         // durasi zoom+blur cepat menuju view hotspot

const overlay = document.getElementById("cg-overlay");
const stage = document.getElementById("cg-stage");
const showBtn = document.getElementById("cg-carousel-show-btn");
const closeBtn = document.getElementById("cg-close-btn");
const prevBtn = document.getElementById("cg-prev-btn");
const nextBtn = document.getElementById("cg-next-btn");

let activeIndex = 0;
let cards = [];
let closeTimer = null;

function buildStage() {
  stage.innerHTML = "";
  cards = photoCG.map((item, i) => {
    const card = document.createElement("div");
    card.className = "cg-card";
    card.innerHTML = `
      <img src="${item.image}" alt="${item.title || ""}" draggable="false" />
      <span class="cg-card-title">${item.title || ""}</span>
    `;
    card.addEventListener("click", () => {
      if (overlay.classList.contains("cg-navigating")) return;
      // Kartu yang bukan tengah: geser dulu supaya jadi tengah.
      if (i !== activeIndex) {
        activeIndex = i;
        render();
        return;
      }
      goToHotspot(item.target);
    });
    stage.appendChild(card);
    return card;
  });
}

function render() {
  const n = cards.length;
  cards.forEach((card, i) => {
    // Jarak melingkar terpendek dari kartu aktif (biar geser kiri/kanan wajar).
    let offset = i - activeIndex;
    if (offset > n / 2) offset -= n;
    if (offset < -n / 2) offset += n;

    const abs = Math.abs(offset);
    const x = offset * 46; // %
    const scale = abs === 0 ? 1 : abs === 1 ? 0.74 : 0.55;
    const rotate = offset === 0 ? 0 : offset > 0 ? -32 : 32;
    const z = 100 - abs;
    const opacity = abs > 2 ? 0 : 1;
    // Foto utama dinaikkan sedikit supaya terlihat "paling atas" dari samping.
    const lift = offset === 0 ? -16 : 0;

    card.style.transform = `translate(-50%, -50%) translateY(${lift}px) translateX(${x}%) scale(${scale}) rotateY(${rotate}deg)`;
    card.style.zIndex = z;
    card.style.opacity = opacity;
    card.classList.toggle("cg-card-active", offset === 0);
  });
}

function open() {
  clearTimeout(closeTimer);
  overlay.classList.remove("cg-navigating");
  buildStage();
  render();
  overlay.classList.remove("hidden");
  // requestAnimationFrame ganda supaya browser sempat "commit" state
  // opacity:0 dulu sebelum ditransisikan ke 1 (biar fade-in beneran jalan).
  requestAnimationFrame(() => {
    requestAnimationFrame(() => overlay.classList.add("cg-visible"));
  });
}

function close() {
  overlay.classList.remove("cg-visible");
  overlay.classList.remove("cg-navigating");
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => overlay.classList.add("hidden"), OPEN_CLOSE_MS);
}

/** Klik foto tengah: load scene 360 tujuan langsung di background,
 *  sambil overlay memberi efek zoom + fade-to-black 3 detik, baru
 *  overlay ditutup total setelah view-nya sudah pasti tampil. */
function goToHotspot(targetId) {
  goToView(targetId);
  overlay.classList.add("cg-navigating");
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    overlay.classList.remove("cg-visible", "cg-navigating");
    overlay.classList.add("hidden");
  }, NAV_MS);
}

function step(dir) {
  const n = cards.length;
  activeIndex = (activeIndex + dir + n) % n;
  render();
}

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
