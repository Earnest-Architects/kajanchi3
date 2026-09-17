/**
 * ============================================================
 *  vr.js — VIEWER VR (vr.html)
 * ============================================================
 * Memakai data yang SAMA PERSIS dengan tur biasa (js/content.js) —
 * tidak ada data yang perlu diduplikasi. Kalau content.js berubah
 * (nambah/kurang ruangan/pitchPoints/content), tampilan VR otomatis
 * ikut menyesuaikan.
 *
 * Cara kerja:
 *   - Gambar 360 ditempel ke <a-sky>, yang otomatis dirender stereo
 *     oleh A-Frame begitu browser masuk sesi WebXR immersive-vr
 *     (misalnya lewat browser bawaan headset Meta Quest).
 *   - Hotspot navigasi memakai "pitchPoints" yang SAMA seperti yang
 *     dipakai tampilan web (Pannellum) — jadi panah nav di VR nempel
 *     di posisi yang sama persis dengan panah di web, bukan menu
 *     ruangan terpisah seperti versi sebelumnya.
 *   - pitchPoints tipe "content" (foto/link/video/embed, lihat
 *     content.js) BUKAN navigasi ke view lain — titik ini digambar
 *     dengan tampilan berbeda (lebih kecil, aksen warna
 *     --content-accent, ikon "i", berkedip pelan — sama seperti
 *     pembedaan di tampilan web) dan saat diklik akan MEMUNCULKAN
 *     PANEL CONTENT sebagai objek 3D SUNGGUHAN di dalam scene (bukan
 *     jendela DOM 2D) — jadi tetap terlihat & bisa dipakai selama
 *     sesi WebXR immersive sungguhan di headset, tidak cuma di mode
 *     "magic window". Panel ini dibangun manual di bawah (fungsi
 *     openContentPanel), mendukung 6 tipe content yang sama seperti
 *     tampilan web: photo, icon-link, text-link, link, youtube, embed.
 *     Catatan teknis: tombol "buka link"/"tonton video" di panel ini
 *     tetap memanggil window.open() ke URL aslinya — itu perilaku
 *     browser biasa untuk keluar ke halaman/video eksternal, jadi
 *     kalau sedang di sesi immersive sungguhan, browser akan keluar
 *     dari mode VR seperti biasa saat membuka tab/halaman baru (sama
 *     seperti mengklik link apapun) — bukan bug, memang begitu cara
 *     kerja link keluar dari dalam WebXR.
 *   - Zoom in/out dikontrol lewat "zoom HUD": bar vertikal (mirip
 *     volume) yang ditempatkan di world space supaya bisa benar-benar
 *     ditoleh dan dijangkau reticle/laser controller.
 * ============================================================ */
import { views, findView, findContent, projectName, metaDescription } from "./content.js";

/* Meta description halaman VR ikut dari content.js juga (satu sumber
   data untuk semua halaman, tidak perlu diedit terpisah per file). */
const vrDescTag = document.querySelector('meta[name="description"]');
if (vrDescTag && metaDescription) vrDescTag.setAttribute("content", metaDescription);

/* Komponen kecil: bikin sebuah entity menghadap satu titik tertentu
   (dipakai supaya ring hotspot selalu menghadap posisi pengguna,
   yang tetap diam di tengah/0 1.6 0). */
AFRAME.registerComponent("face-point", {
  schema: { x: { default: 0 }, y: { default: 1.6 }, z: { default: 0 } },
  init() {
    this.el.object3D.lookAt(this.data.x, this.data.y, this.data.z);
  },
});

/* ---------- Util: pitch/yaw (derajat) -> posisi 3D di bola langit ----------
   Percobaan fix sebelumnya (rotasi Y manual pakai SKY_ROTATION_Y) TERNYATA
   MASIH SALAH karena tidak memperhitungkan satu hal penting: primitive
   <a-sky> bawaan A-Frame punya default scale="-1 1 1" (mirror sumbu X)
   di ATAS rotation="0 -90 0" yang dipasang di vr.html — ini dicek langsung
   dari source code A-Frame (a-sky.js) dan SphereGeometry three.js, bukan
   tebakan lagi. Kombinasi "mirror X" + "rotasi -90°" itu, kalau dihitung
   sampai tuntas, JUSTRU SALING MENIADAKAN dan hasil akhirnya balik lagi
   ke rumus equirectangular standar TANPA offset yaw sama sekali:

     x = R * cos(pitch) * sin(yaw)
     y = tinggi mata + R * sin(pitch)
     z = -R * cos(pitch) * cos(yaw)

   Jadi semua percobaan "offset"/"rotasi kalibrasi" sebelumnya (baik yang
   ditambah langsung ke sudut, maupun yang "diperbaiki" jadi rotasi
   matriks) itu semuanya langkah yang tidak perlu — rumus paling sederhana
   ini yang sudah benar. (Sumbu vertikal/pitch tidak butuh koreksi apa
   pun, karena rotasi Y pada <a-sky> tidak memengaruhi sumbu Y.) */
const HOTSPOT_RADIUS = 4.5;

function pitchYawToPosition(pitch, yaw) {
  const pitchRad = (pitch * Math.PI) / 180;
  const yawRad = (yaw * Math.PI) / 180;
  const x = HOTSPOT_RADIUS * Math.cos(pitchRad) * Math.sin(yawRad);
  const y = 1.6 + HOTSPOT_RADIUS * Math.sin(pitchRad);
  const z = -HOTSPOT_RADIUS * Math.cos(pitchRad) * Math.cos(yawRad);
  return { x, y, z };
}

/* Titik pitchPoints dianggap "content" HANYA kalau type-nya persis
   "content" (sama seperti aturan di content.js). Kalau type tidak
   ditulis sama sekali, tetap dianggap navigasi ke view lain — supaya
   data lama yang belum punya field "type" tetap jalan tanpa berubah. */
function isContentPoint(p) {
  return p.type === "content";
}

const params = new URLSearchParams(window.location.search);
const startId = params.get("scene") || (views[0] && views[0].id);

const sky = document.getElementById("sky");
const hotspots = document.getElementById("hotspots");
const contentPanelEl = document.getElementById("contentPanel");
const world = document.getElementById("world");
const sceneEl = document.querySelector("a-scene");
const camera = document.getElementById("camera");

/* ============================================================
   RECENTER — perbaikan "hotspot/panel content meleset di headset".
   ============================================================
   CONFIRMED lewat dokumentasi WebXR/three.js: saat masuk sesi
   immersive-vr sungguhan, reference space 'local-floor' TIDAK
   menjamin yaw=0 aplikasi sama dengan arah fisik kamu menghadap —
   beda dengan mode desktop/magic-window, di mana kamera memang
   SELALU mulai di yaw 0. Kalau tidak dikompensasi, seluruh isi
   <a-entity id="world"> (sky, hotspot, DAN panel content 3D yang
   posisinya dihitung relatif ke hotspot-nya) akan kelihatan
   terputar sejauh offset itu begitu headset dipakai — walau rumus
   pitchYawToPosition() & layout panel content-nya sendiri sudah
   benar, tidak diubah apa pun di sini.

   Solusi: begitu sesi VR mulai, baca yaw kamera SESAAT ITU (yang
   sudah dipengaruhi tracking headset asli), lalu putar <a-entity
   id="world"> sebesar yaw itu. Efeknya: arah yang sedang kamu
   hadapi saat itu otomatis "dijadikan" yaw 0 versi aplikasi — sama
   seperti perilaku default di desktop. */
function recenterWorld() {
  const obj = camera.object3D;
  obj.updateMatrixWorld(true);
  const euler = new THREE.Euler().setFromRotationMatrix(obj.matrixWorld, "YXZ");
  world.object3D.rotation.y = euler.y;
}

sceneEl.addEventListener("enter-vr", () => {
  // xrSession hanya ada kalau ini sesi WebXR immersive sungguhan
  // (headset asli) — bukan mode "vr-mode" biasa (fullscreen mobile
  // tanpa headset), yang tidak butuh recenter karena kameranya
  // memang tidak dipengaruhi tracking 6DoF device asli.
  if (!sceneEl.xrSession) return;
  // Delay dikit supaya pose pertama dari headset sudah valid dulu
  // sebelum dibaca (kalau langsung dibaca di frame pertama, kadang
  // masih 0/belum ke-update).
  setTimeout(recenterWorld, 100);
  setZoomHudEnabled(false);
});

sceneEl.addEventListener("exit-vr", () => {
  setZoomHudEnabled(true);
});

function loadScene(id) {
  const v = findView(id) || views[0];
  if (!v) return;
  closeContentPanel();
  sky.setAttribute("src", v.image);
  document.title = `${v.title} — ${projectName} VR`;
  buildHotspots(v);
}

/* ---------- Hotspot navigasi + content (identik dengan web: ring + label) ---------- */
function buildHotspots(view) {
  hotspots.innerHTML = "";

  (view.pitchPoints || []).forEach((p) => {
    const isContent = isContentPoint(p);

    /* Titik content butuh objeknya sendiri (buat label & tujuan link);
       kalau targetnya ternyata tidak ketemu di array `contents`,
       lewati titik ini saja (tidak menggambar hotspot rusak / tidak
       mengganggu titik lain). */
    const contentObj = isContent ? findContent(p.target) : null;
    if (isContent && !contentObj) {
      console.warn(
        `[vr.js] pitchPoint type:"content" di view "${view.id}" menunjuk target "${p.target}" ` +
        `yang TIDAK DITEMUKAN di array \`contents\` (js/content.js). Hotspot ini dilewati/tidak digambar. ` +
        `Cek lagi ejaan "target" di pitchPoints vs "id" di contents.`
      );
      return;
    }

    const { x, y, z } = pitchYawToPosition(p.pitch, p.yaw);
    const label =
      p.label ||
      (isContent ? contentObj.title : (findView(p.target) || {}).title) ||
      "";

    /* Kalau showLabel di-set false di content.js, jangan tampilkan teks
       (dukung field yang sama seperti di tampilan web). */
    const showLabel = p.showLabel !== false;

    /* Wrapper: posisi + menghadap ke user. */
    const hotspot = document.createElement("a-entity");
    hotspot.setAttribute("position", `${x} ${y} ${z}`);
    hotspot.setAttribute("face-point", "x: 0; y: 1.6; z: 0");

    /* Titik content digambar lebih kecil & pakai aksen warna
       --content-accent (#e3b06c, sama persis dengan tampilan web)
       supaya langsung kebeda dari titik navigasi (biru) — sama
       seperti pembedaan otomatis di tampilan web (lihat catatan di
       content.js). */
    const RADIUS = isContent ? 0.16 : 0.22;
    const ACCENT = isContent ? "#e3b06c" : "#7fa4d6";

    const GLASS_FILL_IDLE = 0.16;
    const GLASS_FILL_ACTIVE = 0.28;
    const GLASS_BORDER_IDLE = 0.3;
    const GLASS_BORDER_ACTIVE = 0.95;
    const GLASS_LABEL_IDLE = 0.3;
    const GLASS_LABEL_ACTIVE = 1;

    const hitArea = document.createElement("a-entity");
    hitArea.classList.add("clickable");
    hitArea.setAttribute("geometry", `primitive: circle; radius: ${RADIUS}; segments: 32`);
    hitArea.setAttribute("material", `color: #ffffff; shader: flat; opacity: ${GLASS_FILL_IDLE}; side: double`);
    hotspot.appendChild(hitArea);

    /* Border tipis di pinggir kaca — ini yang bikin bentuknya kebaca
       jelas sebagai lingkaran walau isinya cuma kaca buram. */
    const ring = document.createElement("a-entity");
    ring.setAttribute(
      "geometry",
      `primitive: ring; radiusInner: ${RADIUS - 0.03}; radiusOuter: ${RADIUS}; segmentsTheta: 32`
    );
    ring.setAttribute("material", `color: #ffffff; shader: flat; opacity: ${GLASS_BORDER_IDLE}; side: double`);
    ring.setAttribute("position", "0 0 0.001");
    hitArea.appendChild(ring);

    /* Titik/ikon kecil di tengah, warna accent sebagai penanda arah
       (navigasi) atau penanda info (content). Titik content dikasih
       animasi opacity pelan (berkedip) supaya beda kesan dari titik
       navigasi yang diam, konsisten dengan tampilan web. */
    const dot = document.createElement("a-entity");
    if (isContent) {
      dot.setAttribute(
        "text",
        `value: i; align: center; color: ${ACCENT}; width: 4; opacity: ${GLASS_BORDER_IDLE}`
      );
      dot.setAttribute(
        "animation",
        "property: text.opacity; dir: alternate; dur: 900; loop: true; from: 0.3; to: 0.9"
      );
    } else {
      dot.setAttribute("geometry", "primitive: circle; radius: 0.06; segments: 24");
      dot.setAttribute("material", `color: ${ACCENT}; shader: flat; opacity: ${GLASS_BORDER_IDLE}; side: double`);
    }
    dot.setAttribute("position", "0 0 0.002");
    hitArea.appendChild(dot);

    /* Label nama ruangan/content tujuan, di bawah ring */
    let text = null;
    if (showLabel) {
      text = document.createElement("a-entity");
      text.setAttribute(
        "text",
        `value: ${label}; align: center; color: #eef2f8; width: 2.4; wrapCount: 20; opacity: ${GLASS_LABEL_IDLE}`
      );
      text.setAttribute("position", "0 -0.32 0");
      hitArea.appendChild(text);
    }

    /* Efek hover: kacanya jadi lebih "solid"/jelas + sedikit membesar,
       lalu balik lagi ke tampilan kaca buram normal saat cursor pergi.
       Klik tetap di entity yang sama (hitArea). */
    hitArea.addEventListener("mouseenter", () => {
      hitArea.setAttribute("scale", "1.18 1.18 1.18");
      hitArea.setAttribute("material", "opacity", GLASS_FILL_ACTIVE);
      ring.setAttribute("material", "opacity", GLASS_BORDER_ACTIVE);
      if (!isContent) dot.setAttribute("material", "opacity", GLASS_BORDER_ACTIVE);
      if (text) text.setAttribute("text", "opacity", GLASS_LABEL_ACTIVE);
    });
    hitArea.addEventListener("mouseleave", () => {
      hitArea.setAttribute("scale", "1 1 1");
      hitArea.setAttribute("material", "opacity", GLASS_FILL_IDLE);
      ring.setAttribute("material", "opacity", GLASS_BORDER_IDLE);
      if (!isContent) dot.setAttribute("material", "opacity", GLASS_BORDER_IDLE);
      if (text) text.setAttribute("text", "opacity", GLASS_LABEL_IDLE);
    });

    if (isContent) {
      /* Titik content: munculkan panel content 3D di dekat titik hotspot
         ini sendiri (lihat openContentPanel di bawah), bukan di arah
         pandang pengguna saat itu — supaya panel selalu muncul persis
         di sekitar hotspot yang diklik, ditambah garis penghubung tipis
         supaya jelas panel itu "milik" hotspot yang mana. */
      hitArea.addEventListener("click", () => openContentPanel(p.target, { x, y, z }));
    } else {
      hitArea.addEventListener("click", () => loadScene(p.target));
    }

    hotspots.appendChild(hotspot);
  });
}

/* ============================================================
   Panel content 3D — pengganti jendela pop-up DOM (content-modal.js)
   khusus untuk vr.html, supaya tetap tampil & bisa dipakai di dalam
   sesi WebXR immersive sungguhan (headset), bukan cuma mode preview
   "magic window" di browser biasa.
   ------------------------------------------------------------
   Mendukung 6 tipe content yang sama seperti tampilan web (lihat
   dokumentasi lengkap tiap tipe di content.js): "photo", "icon-link",
   "text-link", "link", "youtube", "embed".
   ------------------------------------------------------------
   DESAIN & LAYOUT (v2):
   - Panel TIDAK LAGI muncul di arah pandang pengguna saat itu, tapi
     tepat di ARAH HOTSPOT yang diklik (sedikit lebih dekat & lebih
     tinggi dari hotspotnya) — supaya selalu muncul dekat sumbernya,
     bukan di belakang pengguna kalau pandangannya sudah bergeser.
     Ditambah garis tipis (lihat #contentLink di vr.html) yang
     menghubungkan hotspot ke panelnya, supaya jelas relasinya.
   - Tinggi tiap elemen (judul/teks/gambar/tombol) DIHITUNG DULU
     (estimasi jumlah baris teks x tinggi 1 baris) SEBELUM digambar,
     lalu disusun berurutan dari atas ke bawah dengan jarak antar-
     elemen yang konsisten — supaya teks & tombol tidak pernah
     tumpang tindih apa pun panjang tulisannya, dan tinggi panel
     total menyesuaikan otomatis ke isinya (tidak lagi angka tetap
     per tipe yang gampang kepotong/terlalu longgar).
============================================================ */
const CONTENT_PANEL_DISTANCE = 2.1; // jarak baca nyaman panel dari kamera, meter
const PANEL_W = 1.76;
const PANEL_PAD_X = 0.16; // jarak isi ke tepi kiri/kanan panel
const PANEL_PAD_TOP = 0.15;
const PANEL_PAD_BOTTOM = 0.16;
const LINE_H = 0.09; // perkiraan tinggi 1 baris teks isi (meter)
const TITLE_LINE_H = 0.105; // tinggi 1 baris judul (font judul sedikit lebih besar)
const TEXT_WRAP = 32; // karakter/baris untuk teks isi pada lebar PANEL_W
const TITLE_WRAP = 24; // karakter/baris untuk judul (lebih sempit, kasih ruang tombol tutup)
const BUTTON_H = 0.25;
const contentLinkEl = document.getElementById("contentLink");

/* Estimasi jumlah baris hasil word-wrap. Bukan pengukuran presisi
   (font 3D tidak monospace), sengaja dibuat sedikit "boros" (lebih
   baik kelebihan spasi kosong tipis di bawah daripada kurang &
   akhirnya tumpang tindih dengan elemen berikutnya). */
function estimateLines(value, wrapCount) {
  if (!value) return 0;
  return String(value)
    .split("\n")
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / wrapCount)), 0);
}

function getYouTubeId(url) {
  if (!url) return "";
  const m = String(url).match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/
  );
  return m ? m[1] : "";
}

function extractEmbedSrc(embedHtml) {
  const m = /src=["']([^"']+)["']/i.exec(embedHtml || "");
  return m ? m[1] : null;
}

/* ---------- Blok layout ----------
   Setiap "blok" = { height, gap, render(topY) }. `render` menerima
   posisi TEPI ATAS blok itu (topY) dan bertanggung jawab menaruh
   elemennya sendiri (teks pakai baseline "top" supaya pas nempel di
   topY; plane/tombol/gambar pakai titik tengah = topY - height/2). */
function textBlock(value, { color = "#cfd6e4", wrap = TEXT_WRAP, gap = 0.1 } = {}) {
  const lines = estimateLines(value, wrap);
  const height = lines * LINE_H;
  return {
    height,
    gap,
    render(topY) {
      if (!lines) return;
      const el = document.createElement("a-entity");
      el.setAttribute("text", {
        value: value || "",
        align: "center",
        color,
        width: PANEL_W - PANEL_PAD_X * 2,
        wrapCount: wrap,
        baseline: "top",
        lineHeight: 42,
      });
      el.setAttribute("position", `0 ${topY} 0.004`);
      contentPanelEl.appendChild(el);
    },
  };
}

/* Tombol aksi utama (mis. "Buka link", "Tonton di YouTube"). Kalau
   url kosong/tidak ada, tombol tetap digambar tapi redup & tidak bisa
   diklik — supaya panel tidak pernah error, cuma kelihatan nonaktif. */
function buttonBlock(label, url, { gap = 0 } = {}) {
  const height = BUTTON_H;
  return {
    height,
    gap,
    render(topY) {
      const centerY = topY - height / 2;
      const btn = document.createElement("a-entity");
      const width = Math.min(PANEL_W - PANEL_PAD_X * 2, 1.3);
      btn.setAttribute("geometry", `primitive: plane; width: ${width}; height: ${height}`);
      btn.setAttribute("position", `0 ${centerY} 0.004`);

      const btnLabel = document.createElement("a-entity");
      btnLabel.setAttribute("text", {
        value: label || "",
        align: "center",
        color: "#ffffff",
        width: width - 0.1,
        wrapCount: 26,
        baseline: "center",
      });
      btnLabel.setAttribute("position", "0 0 0.002");
      btn.appendChild(btnLabel);

      if (url) {
        btn.classList.add("clickable");
        btn.setAttribute("material", "color: #d1157a; opacity: 0.95; side: double");
        btn.addEventListener("click", () => window.open(url, "_blank", "noopener"));
        btn.addEventListener("mouseenter", () => btn.setAttribute("scale", "1.04 1.04 1.04"));
        btn.addEventListener("mouseleave", () => btn.setAttribute("scale", "1 1 1"));
      } else {
        btn.setAttribute("material", "color: #3a3d47; opacity: 0.6; side: double");
      }
      contentPanelEl.appendChild(btn);
    },
  };
}

/* Gambar/foto: DIALOKASIKAN kotak berukuran tetap (maxW x maxH) dari
   awal (supaya tinggi panel tidak berubah-ubah/geser saat gambar
   baru selesai dimuat), lalu gambar aslinya di-"contain" (dijaga
   rasionya, dikecilkan & ditengahkan) di DALAM kotak itu begitu
   selesai dimuat. Sebelum itu, tempatnya diisi kotak placeholder
   redup dulu. */
function imageBlock(src, maxW, maxH, { gap = 0.12, decorate } = {}) {
  return {
    height: maxH,
    gap,
    render(topY) {
      const centerY = topY - maxH / 2;
      const frame = document.createElement("a-entity");
      frame.setAttribute("position", `0 ${centerY} 0.003`);
      contentPanelEl.appendChild(frame);

      const placeholder = document.createElement("a-plane");
      placeholder.setAttribute("width", maxW);
      placeholder.setAttribute("height", maxH);
      placeholder.setAttribute("color", "#1a1c24");
      placeholder.setAttribute("opacity", 0.85);
      frame.appendChild(placeholder);

      if (decorate) decorate(frame, maxW, maxH);
      if (!src) return;

      const img = new Image();
      img.onload = () => {
        // Kalau panel sudah ditutup/diganti sebelum gambar selesai
        // dimuat, jangan sentuh apa-apa lagi (hindari elemen "hantu").
        if (!frame.isConnected) return;
        let w = maxW;
        let h = w * (img.naturalHeight / img.naturalWidth || 1);
        if (h > maxH) {
          h = maxH;
          w = h * (img.naturalWidth / img.naturalHeight || 1);
        }
        placeholder.setAttribute("width", w);
        placeholder.setAttribute("height", h);
        placeholder.setAttribute("material", `src: ${src}; shader: flat`);
        placeholder.setAttribute("opacity", 1);
      };
      img.onerror = () => {
        // Gagal dimuat: biarkan placeholder redup, tidak error ke pengguna.
      };
      img.src = src;
    },
  };
}

/* ---------- Susun blok per tipe content (identik dengan 6 tipe di web) ---------- */
function blocksForContent(c) {
  const innerW = PANEL_W - PANEL_PAD_X * 2;

  switch (c.type) {
    case "photo": {
      const blocks = [imageBlock(c.image, innerW, innerW * 0.62, { gap: c.text ? 0.1 : 0 })];
      if (c.text) blocks.push(textBlock(c.text, { gap: 0 }));
      return blocks;
    }

    case "icon-link": {
      const blocks = [imageBlock(c.image, 0.34, 0.34, { gap: 0.1 })];
      if (c.text) blocks.push(textBlock(c.text, { gap: 0.14 }));
      blocks.push(buttonBlock(c.linkLabel || "Buka link", c.link));
      return blocks;
    }

    case "text-link": {
      const blocks = [];
      if (c.text) blocks.push(textBlock(c.text, { gap: 0.16 }));
      blocks.push(buttonBlock(c.linkLabel || "Buka link", c.link));
      return blocks;
    }

    case "link": {
      return [buttonBlock(c.linkLabel || c.link || "Buka link", c.link)];
    }

    case "youtube": {
      const id = getYouTubeId(c.youtubeUrl);
      if (!id) return [textBlock("Link YouTube tidak valid.", { color: "#e79a9a" })];
      return [
        imageBlock(`https://img.youtube.com/vi/${id}/hqdefault.jpg`, innerW, innerW * 0.5625, {
          gap: 0.12,
          decorate: (frame) => {
            const play = document.createElement("a-entity");
            play.setAttribute("geometry", "primitive: circle; radius: 0.09; segments: 24");
            play.setAttribute("material", "color: #000000; opacity: 0.55; shader: flat; side: double");
            play.setAttribute("position", "0 0 0.001");
            const glyph = document.createElement("a-entity");
            glyph.setAttribute("text", {
              value: "\u25B6",
              align: "center",
              color: "#ffffff",
              width: 5,
              baseline: "center",
            });
            glyph.setAttribute("position", "0.006 0 0.002");
            play.appendChild(glyph);
            frame.appendChild(play);
          },
        }),
        buttonBlock("Tonton di YouTube", c.youtubeUrl),
      ];
    }

    case "embed": {
      const src = extractEmbedSrc(c.embedHtml);
      if (!src) return [textBlock("Konten embed tidak tersedia di VR.", { color: "#e79a9a" })];
      return [
        textBlock("Konten ini akan dibuka di tab browser.", { gap: 0.16 }),
        buttonBlock("Buka", src),
      ];
    }

    default:
      return [textBlock("Tipe content tidak dikenal.", { color: "#e79a9a" })];
  }
}

function closeContentPanel() {
  contentPanelEl.innerHTML = "";
  contentLinkEl.removeAttribute("line");
}

function openContentPanel(id, hotspotPos) {
  const c = findContent(id);
  if (!c) return;

  contentPanelEl.innerHTML = "";

  /* ---- Posisi: di arah hotspot yang diklik, bukan arah pandang saat ini ----
     Supaya panel selalu muncul dekat sumbernya. Ditarik lebih dekat dari
     radius sky (supaya nyaman dibaca) & digeser sedikit ke atas (supaya
     tidak menutupi ikon hotspotnya sendiri). Kalau karena suatu hal posisi
     hotspot tidak tersedia, pakai arah pandang saat ini sebagai fallback. */
  const origin = new THREE.Vector3(0, 1.6, 0);
  let dir;
  if (hotspotPos) {
    dir = new THREE.Vector3(hotspotPos.x, hotspotPos.y, hotspotPos.z).sub(origin);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    dir.normalize();
  } else {
    dir = new THREE.Vector3();
    camera.object3D.getWorldDirection(dir);
  }
  const pos = origin.clone().addScaledVector(dir, CONTENT_PANEL_DISTANCE);
  pos.y += 0.38;

  contentPanelEl.setAttribute("position", `${pos.x} ${pos.y} ${pos.z}`);
  contentPanelEl.setAttribute("face-point", "x: 0; y: 1.6; z: 0");

  /* Garis tipis penghubung hotspot -> panel (world space, entity terpisah
     supaya koordinatnya tidak ikut ter-rotasi oleh face-point milik panel). */
  if (hotspotPos) {
    contentLinkEl.setAttribute("line", {
      start: `${hotspotPos.x} ${hotspotPos.y} ${hotspotPos.z}`,
      end: `${pos.x} ${pos.y - 0.3} ${pos.z}`,
      color: "#e3b06c",
      opacity: 0.5,
    });
  } else {
    contentLinkEl.removeAttribute("line");
  }

  /* ---- Layout: hitung tinggi tiap blok dulu, baru gambar dari atas ---- */
  const titleLines = Math.max(1, estimateLines(c.title, TITLE_WRAP));
  const titleH = titleLines * TITLE_LINE_H;
  const DIVIDER_GAP_BEFORE = 0.09;
  const DIVIDER_GAP_AFTER = 0.13;

  const bodyBlocks = blocksForContent(c);
  const bodyHeight = bodyBlocks.reduce((sum, b) => sum + b.height + b.gap, 0);

  const panelH =
    PANEL_PAD_TOP + titleH + DIVIDER_GAP_BEFORE + 0.006 + DIVIDER_GAP_AFTER + bodyHeight + PANEL_PAD_BOTTOM;

  /* Border tipis + isi kaca gelap, gaya sama seperti hotspot & zoom HUD. */
  const border = document.createElement("a-plane");
  border.setAttribute("width", PANEL_W + 0.05);
  border.setAttribute("height", panelH + 0.05);
  border.setAttribute("color", "#e3b06c");
  border.setAttribute("opacity", 0.45);
  border.setAttribute("position", "0 0 -0.002");
  contentPanelEl.appendChild(border);

  const backdrop = document.createElement("a-plane");
  backdrop.setAttribute("width", PANEL_W);
  backdrop.setAttribute("height", panelH);
  backdrop.setAttribute("color", "#14161f");
  backdrop.setAttribute("opacity", 0.95);
  contentPanelEl.appendChild(backdrop);

  /* Aksen tipis di tepi atas (pengganti border tebal di sekeliling —
     kesannya lebih bersih/modern), lebar penuh, warna sama dengan accent. */
  const topAccent = document.createElement("a-plane");
  topAccent.setAttribute("width", PANEL_W);
  topAccent.setAttribute("height", 0.02);
  topAccent.setAttribute("color", "#e3b06c");
  topAccent.setAttribute("opacity", 0.85);
  topAccent.setAttribute("position", `0 ${panelH / 2 - 0.01} 0.001`);
  contentPanelEl.appendChild(topAccent);

  let cursor = panelH / 2 - PANEL_PAD_TOP;

  /* Judul — lebar dipersempit supaya tidak pernah menabrak tombol tutup. */
  const title = document.createElement("a-entity");
  title.setAttribute("text", {
    value: c.title || "",
    align: "center",
    color: "#f3d29c",
    width: PANEL_W - 0.6,
    wrapCount: TITLE_WRAP,
    baseline: "top",
  });
  title.setAttribute("position", `0 ${cursor} 0.004`);
  contentPanelEl.appendChild(title);
  cursor -= titleH + DIVIDER_GAP_BEFORE;

  /* Divider tipis pemisah judul & isi. */
  const divider = document.createElement("a-plane");
  divider.setAttribute("width", PANEL_W - PANEL_PAD_X * 2);
  divider.setAttribute("height", 0.006);
  divider.setAttribute("color", "#e3b06c");
  divider.setAttribute("opacity", 0.3);
  divider.setAttribute("position", `0 ${cursor} 0.004`);
  contentPanelEl.appendChild(divider);
  cursor -= 0.006 + DIVIDER_GAP_AFTER;

  /* Tombol tutup, pojok kanan atas panel — dibuat setelah backdrop
     supaya selalu di lapisan terdepan/tidak ketiban elemen lain. */
  const closeBtn = document.createElement("a-entity");
  closeBtn.classList.add("clickable");
  closeBtn.setAttribute("geometry", "primitive: circle; radius: 0.075; segments: 20");
  closeBtn.setAttribute("material", "color: #262832; opacity: 0.95; side: double");
  closeBtn.setAttribute("position", `${PANEL_W / 2 - 0.15} ${panelH / 2 - 0.15} 0.005`);
  const closeLabel = document.createElement("a-entity");
  closeLabel.setAttribute("text", { value: "\u2715", align: "center", color: "#f5f2ea", width: 4, baseline: "center" });
  closeLabel.setAttribute("position", "0 0 0.001");
  closeBtn.appendChild(closeLabel);
  closeBtn.addEventListener("mouseenter", () => closeBtn.setAttribute("scale", "1.15 1.15 1.15"));
  closeBtn.addEventListener("mouseleave", () => closeBtn.setAttribute("scale", "1 1 1"));
  closeBtn.addEventListener("click", closeContentPanel);
  contentPanelEl.appendChild(closeBtn);

  /* Isi (body) — setiap blok digambar lalu cursor turun sejumlah tinggi + gap-nya. */
  bodyBlocks.forEach((block) => {
    block.render(cursor);
    cursor -= block.height + block.gap;
  });
}

/* ============================================================
   Zoom HUD — bar vertikal mirip volume, ditempatkan di world space
   (lihat vr.html) supaya bisa ditoleh & dijangkau reticle/laser.
   Semua elemennya mulai dari opacity 3% (nyaris tak terlihat) dan
   baru menyala penuh selama cursor ada di area HUD ini.
   Catatan: ini mengubah field-of-view (fov) kamera. Di sesi WebXR
   immersive-vr sungguhan (headset native), fov biasanya dikunci oleh
   device sendiri; efeknya paling terasa di mode "magic window"
   (preview VR lewat browser HP/desktop tanpa sesi immersive), yang
   sepertinya ini mode yang sedang dites sekarang.
============================================================ */
const zoomHud = document.getElementById("zoomHud");
zoomHud.setAttribute("face-point", "x: 0; y: 1.6; z: 0");

const DEFAULT_FOV = 80;
const MIN_FOV = 40; // paling zoom-in
const MAX_FOV = 100; // paling zoom-out
const FOV_STEP = 8;
const TRACK_HEIGHT = 0.55;
const BTN_RADIUS = 0.09; // diperbesar dari 0.055 supaya lebih gampang kena reticle

let currentFov = DEFAULT_FOV;
let fill; // element bar isi, diisi oleh buildZoomHud()

function levelFromFov(fov) {
  // 0 = paling zoom-out (MAX_FOV), 1 = paling zoom-in (MIN_FOV)
  return (MAX_FOV - fov) / (MAX_FOV - MIN_FOV);
}

function applyFov(fov) {
  // CONFIRMED (dicek ke dokumentasi three.js WebXRManager): selama sesi
  // immersive-vr sungguhan berjalan, projection matrix kamera diambil
  // LANGSUNG dari device (headset) tiap frame — properti "fov" pada
  // <a-camera> DIABAIKAN TOTAL, tidak peduli berapapun nilainya. Ini
  // bukan bug proyek ini; ini memang batasan WebXR itu sendiri (device
  // yang berhak menentukan fov, bukan halaman web, supaya nyaman dipakai
  // & tidak bikin pusing/mabuk VR). Makanya tombol +/- di Quest bisa
  // diklik (currentFov & fill bar tetap ke-update), tapi visual 360-nya
  // tidak pernah ikut berubah. Makanya HUD ini otomatis disembunyikan
  // (lihat setZoomHudEnabled) begitu sesi immersive asli terdeteksi.
  currentFov = Math.min(MAX_FOV, Math.max(MIN_FOV, fov));
  camera.setAttribute("camera", "fov", currentFov);
  updateFill();
}

/* Sembunyikan + matikan interaksi HUD zoom saat di sesi immersive asli
   (fov memang tidak bisa dikontrol di sana — lihat catatan di applyFov).
   Tetap tampil normal di mode desktop/magic-window, karena di situ fov
   BENERAN berpengaruh. */
function setZoomHudEnabled(enabled) {
  zoomHud.setAttribute("visible", enabled);
  zoomHud.querySelectorAll(".clickable").forEach((el) => {
    if (enabled) el.classList.add("clickable");
    else el.classList.remove("clickable");
  });
}

function updateFill() {
  const level = levelFromFov(currentFov);
  const fillHeight = Math.max(0.02, TRACK_HEIGHT * level);
  fill.setAttribute("height", fillHeight);
  fill.setAttribute("position", `0 ${-TRACK_HEIGHT / 2 + fillHeight / 2} 0.001`);
}

/* Efek "kaca buram" (glassmorphism): idle bukan nyaris-nol, tapi cukup
   rendah supaya tetap kelihatan sebagai panel kaca tanpa mengganggu
   pandangan; naik ke lebih solid/jelas begitu cursor ada di areanya. */
const ZOOM_IDLE = {
  track: 0.32,
  fill: 0.3,
  btn: 0.32,
  label: 0.3,
};
const ZOOM_ACTIVE = {
  track: 0.6,
  fill: 0.85,
  btn: 0.7,
  label: 1,
};

function buildZoomHud() {
  zoomHud.innerHTML = "";

  /* Track/rel bar — kaca buram gelap (idle), lebih solid saat cursor
     menempel di mana pun di area HUD ini. */
  const track = document.createElement("a-plane");
  track.setAttribute("width", "0.08");
  track.setAttribute("height", TRACK_HEIGHT);
  track.setAttribute("color", "#161616");
  track.setAttribute("opacity", ZOOM_IDLE.track);
  track.classList.add("clickable");
  zoomHud.appendChild(track);

  /* Isi bar (menunjukkan level zoom saat ini, seperti volume) */
  const fillEl = document.createElement("a-plane");
  fillEl.setAttribute("width", "0.08");
  fillEl.setAttribute("color", "#7fa4d6");
  fillEl.setAttribute("opacity", ZOOM_IDLE.fill);
  zoomHud.appendChild(fillEl);
  fill = fillEl;

  /* Tombol zoom-in (+) di atas bar */
  const plusBtn = document.createElement("a-entity");
  plusBtn.setAttribute("position", `0 ${TRACK_HEIGHT / 2 + BTN_RADIUS + 0.05} 0`);
  plusBtn.classList.add("clickable");
  plusBtn.setAttribute("geometry", `primitive: circle; radius: ${BTN_RADIUS}; segments: 24`);
  plusBtn.setAttribute("material", `color: #161616; opacity: ${ZOOM_IDLE.btn}; side: double`);
  const plusLabel = document.createElement("a-entity");
  plusLabel.setAttribute("text", `value: +; align: center; color: #eef2f8; width: 3.4; opacity: ${ZOOM_IDLE.label}`);
  plusLabel.setAttribute("position", "0 0 0.001");
  plusBtn.appendChild(plusLabel);
  plusBtn.addEventListener("click", () => applyFov(currentFov - FOV_STEP));
  zoomHud.appendChild(plusBtn);

  /* Tombol zoom-out (−) di bawah bar */
  const minusBtn = document.createElement("a-entity");
  minusBtn.setAttribute("position", `0 ${-TRACK_HEIGHT / 2 - BTN_RADIUS - 0.05} 0`);
  minusBtn.classList.add("clickable");
  minusBtn.setAttribute("geometry", `primitive: circle; radius: ${BTN_RADIUS}; segments: 24`);
  minusBtn.setAttribute("material", `color: #161616; opacity: ${ZOOM_IDLE.btn}; side: double`);
  const minusLabel = document.createElement("a-entity");
  minusLabel.setAttribute("text", `value: -; align: center; color: #eef2f8; width: 3.4; opacity: ${ZOOM_IDLE.label}`);
  minusLabel.setAttribute("position", "0 0 0.001");
  minusBtn.appendChild(minusLabel);
  minusBtn.addEventListener("click", () => applyFov(currentFov + FOV_STEP));
  zoomHud.appendChild(minusBtn);

  /* Nyalakan/redupkan semua elemen HUD sekaligus. Sebelumnya ada satu
     "backdrop" tak terlihat (opacity 0) yang menutupi seluruh area buat
     mendeteksi hover gabungan — itu dihapus karena diduga jadi penyebab
     zoom bar sempat tidak tergambar (kemungkinan konflik urutan render
     antara elemen transparan). Sekarang tiap elemen (track & kedua
     tombol) langsung memicu highlight KESELURUHAN grup lewat fungsi
     yang sama, jadi efeknya tetap "semua menyala bersamaan" tanpa
     elemen ekstra yang tidak perlu. */
  function setHudVisible(visible) {
    track.setAttribute("opacity", visible ? ZOOM_ACTIVE.track : ZOOM_IDLE.track);
    fill.setAttribute("opacity", visible ? ZOOM_ACTIVE.fill : ZOOM_IDLE.fill);
    plusBtn.setAttribute("material", "opacity", visible ? ZOOM_ACTIVE.btn : ZOOM_IDLE.btn);
    minusBtn.setAttribute("material", "opacity", visible ? ZOOM_ACTIVE.btn : ZOOM_IDLE.btn);
    plusLabel.setAttribute("text", "opacity", visible ? ZOOM_ACTIVE.label : ZOOM_IDLE.label);
    minusLabel.setAttribute("text", "opacity", visible ? ZOOM_ACTIVE.label : ZOOM_IDLE.label);
  }
  [track, plusBtn, minusBtn].forEach((el) => {
    el.addEventListener("mouseenter", () => setHudVisible(true));
    el.addEventListener("mouseleave", () => setHudVisible(false));
  });

  /* Klik langsung di track untuk lompat ke level tertentu (seperti geser volume) */
  track.addEventListener("click", (evt) => {
    const point = evt.detail.intersection && evt.detail.intersection.point;
    if (!point) return;
    const local = new THREE.Vector3();
    track.object3D.worldToLocal(local.copy(point));
    const level = Math.min(1, Math.max(0, local.y / TRACK_HEIGHT + 0.5));
    applyFov(MAX_FOV - level * (MAX_FOV - MIN_FOV));
  });
}

buildZoomHud();
applyFov(DEFAULT_FOV);

loadScene(startId);
