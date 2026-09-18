/**
 * ============================================================
 *  content.js — SATU-SATUNYA FILE YANG PERLU DIEDIT
 * ============================================================
 * Semua konten tur ada di sini: daftar lantai (denah), daftar
 * gambar 360 (views), titik pada denah, dan panah navigasi
 * (pitch point) di dalam tiap gambar 360.
 *
 * Tidak perlu menyentuh file JS lain untuk:
 *   - menambah / menghapus lantai
 *   - menambah / menghapus gambar 360 (view)
 *   - menambah / menghapus titik pada denah
 *   - menambah / menghapus pitch point di dalam gambar 360
 *   - menambah / menghapus CONTENT (foto, link, video, embed) yang
 *     muncul lewat jendela pop-up saat sebuah hotspot diklik
 * Cukup tambah atau hapus objeknya di array yang bersangkutan,
 * tampilan (denah, panah navigasi, hotspot content) otomatis
 * menyesuaikan.
 *
 * CARA MENCARI NILAI PITCH & YAW:
 *   Buka pitch-finder.html, pilih gambar 360 yang mau dicari
 *   titiknya, lalu klik posisi yang diinginkan di dalam gambar.
 *   Nilai pitch & yaw akan muncul dan bisa langsung disalin ke
 *   dalam "pitchPoints" di bawah.
 *
 * NAMA PROJECT (projectName):
 *   Dipakai otomatis oleh js/viewer.js & js/vr.js untuk:
 *     - Judul tab browser        -> "(projectName) Virtual Tour | Earnest Architects"
 *     - Judul besar di layar     -> "(projectName) Virtual Tour"
 *     - Judul preview link sosmed (og:title / twitter:title)
 *   Ganti nilainya di sini saja, tidak perlu edit file JS/HTML lain.
 *
 * DESKRIPSI PROJECT (metaDescription):
 *   Dipakai otomatis untuk meta description SEO & preview link
 *   sosial media (og:description / twitter:description).
 *   Ganti nilainya di sini saja.
 * ============================================================
 */

export const projectName = "Kajanchi";
export const metaDescription = "Kajanchi - 360° バーチャルツアー by Earnest Architects.";

/* FITUR CATATAN HOTSPOT (note-finder.html + panel "Notes" di index.html):
   - true  -> icon 💬 "Leave a note" & panel "Notes" tampil, butuh Worker
              Cloudflare + KV yang sudah disambungkan (lihat
              cloudflare-worker/README.md).
   - false -> semua UI catatan disembunyikan otomatis, TIDAK perlu bikin
              Worker/KV Cloudflare sama sekali untuk project ini. File
              note-finder.html dkk boleh tetap ada di repo, tidak dipakai. */
export const notesEnabled = true;

/* ============================================================
   FITUR AUTO TOUR (tombol ▶ di icon-rail):
   Klik sekali -> fullscreen, musik latar diputar looping, lalu
   360 otomatis rotasi per scene sesuai urutan & durasi di bawah,
   pindah scene pakai transisi crossfade + blur.

   - music    : daftar file mp3, diputar berurutan lalu diulang
                dari awal lagi selama mode PLAY masih aktif.
   - rotateSpeed        : kecepatan auto-rotate (derajat/detik).
                           Positif = muter ke kanan, negatif = ke kiri.
   - transitionDuration : lama efek blur+crossfade antar scene (ms).
   - sequence : urutan scene yang diputar + berapa lama (ms) tiap
                scene berhenti/berputar sebelum pindah ke scene
                berikutnya. "id" harus sama persis dengan salah
                satu id di array `views` di bawah. Boleh diedit
                bebas (tambah/hapus/urutkan ulang/ubah durasi)
                tanpa perlu menyentuh file JS lain.
============================================================ */
export const autoTour = {
  music: ["assets/bgm/asset1.mp3", "assets/bgm/asset2.mp3"],
  rotateSpeed: 6,
  transitionDuration: 1400,
  // Berapa lama (ms) menunggu setelah pengunjung melepas mouse/jari
  // sebelum 360 otomatis berputar lagi (drag manual tetap berfungsi
  // penuh selama mode PLAY aktif; ini cuma jeda sebelum auto-rotate
  // lanjut lagi).
  resumeDelay: 3000,
  sequence: [
    { id: "view7", duration: 8000 },
    { id: "view2", duration: 10000 },
    { id: "view3", duration: 10000 },
    { id: "view4", duration: 10000 },
    { id: "view5", duration: 10000 },
    { id: "view6", duration: 10000 },
  ],
};

/* ============================================================
   1) DENAH (FLOORPLAN)
   ------------------------------------------------------------
   Setiap objek di array ini = 1 lantai.
   - image  : path gambar denah lantai tsb.
   - points : titik-titik pada denah yang bisa diklik untuk
              berpindah ke sebuah VIEW 360.
       target : harus sama persis dengan salah satu "id" di
                array `views` di bagian bawah file ini.
       x, y   : posisi titik pada gambar denah, dalam PERSEN (%)
                dihitung dari kiri (x) dan dari atas (y).
       label  : opsional. Kalau tidak diisi, otomatis memakai
                "title" dari view tujuannya.

   Tambah lantai baru = tambah 1 objek baru di array `floors`.
   Hapus lantai = hapus objeknya dari array ini.
============================================================ */
export const floors = [
  {
    id: "floor1",
    label: "1F",
    name: "1階",
    image: "assets/floorplan.jpg",
    points: [
      { target: "view1", x: 72.2, y: 83 },
      { target: "view2", x: 47.4, y: 33 },
      { target: "view3", x: 64, y: 24.5 },
      { target: "view4", x: 39, y: 22.7 },
      { target: "view5", x: 36.1, y: 15.1 },
      { target: "view6", x: 67.8, y: 15.9 },
      { target: "view8", x: 52.8, y: 97.8 },
    ],
  },
];

/* ============================================================
   2) GAMBAR 360 (VIEWS)
   ------------------------------------------------------------
   Setiap objek di array ini = 1 gambar panorama 360.
   - id         : pengenal unik. Dipakai sebagai "target" di atas
                  dan di pitchPoints view lain.
   - title      : judul yang tampil di layar & dipakai otomatis
                  sebagai label titik/pitch point yang menuju ke
                  view ini kalau label tidak diisi manual.
   - image      : path file gambar panorama.
   - yawOffset  : opsional, arah hadap awal saat view ini dibuka
                  (derajat, 0-360).
   - pitchPoints: titik-titik yang menempel DI DALAM gambar 360
                  ini. Ada 2 macam target:

       A) Menuju VIEW 360 lain (tampilan lama, tetap sama persis):
            { pitch: 1.9, yaw: 159.8, target: "view2" }
          "target" harus sama dengan salah satu "id" di array
          `views` ini. Kalau "type" tidak ditulis sama sekali,
          otomatis dianggap tipe ini (jadi data lama tetap jalan
          tanpa perlu diubah apa-apa).

       B) Menuju CONTENT — fitur tambahan: foto, ikon+link,
          teks+link, link saja, video YouTube, atau embed lain.
          Saat diklik, muncul jendela pop-up (bisa ditutup &
          diperbesar), TIDAK berpindah gambar 360:
            { pitch: 1.9, yaw: 159.8, type: "content", target: "content-promo" }
          "target" harus sama dengan salah satu "id" di array
          `contents` (lihat bagian 3 di bawah). Wajib tulis
          `type: "content"` supaya dikenali sebagai tipe ini.

       Field yang berlaku untuk keduanya:
         pitch, yaw : sudut, ambil dari pitch-finder.html (di
                      pitch-finder.html pilih tab "🖼️ Panorama"
                      untuk tipe A, atau "🧩 Content" untuk tipe B,
                      supaya tidak ketuker saat memilih target).
         label      : opsional, teks yang tampil di titik. Kalau
                      dikosongkan, otomatis pakai title dari view
                      target (tipe A) atau title dari content
                      target (tipe B).
         showLabel  : opsional, isi `false` supaya titik tampil
                      TANPA teks sama sekali (hanya ikon saja) —
                      berlaku baik tipe A maupun B. Default: true
                      (teks ditampilkan).

   Tampilan ikon tipe A (menuju panorama lain) dan tipe B (menuju
   content) sengaja dibedakan otomatis oleh sistem: ikon tipe B
   lebih kecil dan berkedip sedikit lebih cepat, supaya pengunjung
   bisa langsung membedakan mana titik yang pindah ruangan dan mana
   yang membuka info tambahan.

   Tambah gambar 360 baru = tambah 1 objek baru di array `views`,
   lalu taruh file panoramanya di folder assets/.
   Hapus view = hapus objeknya dari array ini (jangan lupa hapus
   juga pitchPoints/titik denah lain yang masih menunjuk ke id-nya).
============================================================ */
export const views = [
  {
    id: "view1",
    title: "Exterior-close",
    image: "assets/EX2-CLOSE.jpg",
    yawOffset: 0,
    pitchPoints: [
      { pitch: 3.17, yaw: 97.59, target: "view2" },
      { pitch: -10.29, yaw: -42.11, target: "view9" },
      { pitch: -16.84, yaw: -94.42, target: "view8" },
    ],
  },
  {
    id: "view2",
    title: "Master Bedroom",
    image: "assets/pano2.jpg",
    yawOffset: 0,
    pitchPoints: [
      { pitch: -2.72, yaw: 87.5, target: "view1" },
      { pitch: -20.28, yaw: -37.74, target: "view3" },
    ],
  },
  {
    id: "view3",
    title: "Master Bedroom",
    image: "assets/pano3.jpg",
    yawOffset: 0,
    pitchPoints: [
      { pitch: -2.47, yaw: 10.51, target: "view1" },
      { pitch: -19.93, yaw: 31.85, target: "view2" },
      { pitch: -19.76, yaw: 79.18, target: "view4" },
    ],
  },
  {
    id: "view4",
    title: "W.I.C",
    image: "assets/pano4.jpg",
    yawOffset: 0,
    pitchPoints: [
      { pitch: -30.76, yaw: -158.68, target: "view3" },
      { pitch: -33.52, yaw: 85.58, target: "view5" },
    ],
  },
  {
    id: "view5",
    title: "Dressing Room",
    image: "assets/pano5.jpg",
    yawOffset: 0,
    pitchPoints: [
      { pitch: -15.21, yaw: 26.4, target: "view6" },
      { pitch: -35.95, yaw: 61.21, target: "view4" },
    ],
  },
  {
    id: "view6",
    title: "Bathroom",
    image: "assets/pano6.jpg",
    yawOffset: 0,
    pitchPoints: [{ pitch: -27.31, yaw: -87.86, target: "view5" }],
  },
  {
    id: "view7",
    title: "Open",
    image: "assets/EX-OPEN.jpg",
    yawOffset: 0,
    pitchPoints: [
      { pitch: 8.82, yaw: -6.25, target: "view8" },
      { pitch: -11.83, yaw: 22.45, target: "view1" },
    ],
  },
  {
    id: "view8",
    title: "Exterior-close",
    image: "assets/EX-CLOSE.jpg",
    yawOffset: 0,
    pitchPoints: [
      { pitch: -7.33, yaw: -6.38, target: "view7" },
      { pitch: -10.68, yaw: 21.88, target: "view1" },
    ],
  },
  {
    id: "view9",
    title: "Open",
    image: "assets/EX2-OPEN.jpg",
    yawOffset: 0,
    pitchPoints: [
      { pitch: 17.8, yaw: -43.33, target: "view1" },
      { pitch: -15.65, yaw: -95.91, target: "view8" },
      { pitch: 2.68, yaw: 97.91, target: "view2" },
    ],
  },
];

/* ============================================================
   3) CONTENT (foto / ikon+link / teks+link / link / video / embed)
   ------------------------------------------------------------
   Fitur tambahan: dipakai oleh pitchPoints tipe B (lihat
   penjelasan di atas array `views`). Ini titik yang KALAU DIKLIK
   membuka jendela pop-up berisi info tambahan — bukan berpindah
   ke gambar 360 lain. Boleh dibiarkan kosong ([]) kalau fitur ini
   belum dipakai; semua pitchPoints yang menuju view 360 tetap
   jalan normal seperti biasa.

   Cara pakai:
     1) Tambah 1 objek baru di array `contents` di bawah ini.
     2) Tunjuk objek itu dari `pitchPoints` milik view yang mana
        saja, pakai `type: "content"` dan `target: "<id di sini>"`.
     3) Di pitch-finder.html, klik dulu titiknya seperti biasa,
        lalu pilih tab target "🧩 Content" (bukan "🖼️ Panorama")
        supaya milih content-nya gampang, tidak ketuker dengan
        daftar gambar 360.

   Setiap objek WAJIB punya:
     id    : pengenal unik (dipakai sebagai "target" di pitchPoints).
     title : judul, tampil sebagai judul jendela pop-up & otomatis
             jadi label titik kalau "label" tidak diisi manual.
     type  : salah satu dari 6 pilihan berikut —
               "photo"     -> tampilkan 1 foto (+ teks opsional).
               "icon-link" -> ikon/gambar kecil + tombol link.
               "text-link" -> teks + tombol link.
               "link"      -> cuma 1 tombol/link saja, tanpa apa-apa.
               "youtube"   -> video YouTube (isi link videonya saja,
                              format apapun: youtube.com/watch?v=...
                              atau youtu.be/...).
               "embed"     -> embed bebas (kode <iframe> atau HTML
                              lain, mis. Google Maps, TikTok, dsb).

   Field lain tergantung "type" yang dipilih (isi seperlunya saja,
   sisanya boleh dihapus dari objeknya):
     image      : path foto/ikon (dipakai oleh "photo" & "icon-link").
     text       : teks/deskripsi (dipakai oleh "photo" & "text-link").
     link       : url tujuan tombol (dipakai oleh "icon-link",
                  "text-link", "link").
     linkLabel  : opsional, teks tombolnya. Kalau kosong otomatis
                  jadi "Buka link".
     youtubeUrl : url video (dipakai oleh "youtube").
     embedHtml  : kode embed mentah, mis. '<iframe src="..."></iframe>'
                  (dipakai oleh "embed").
============================================================ */
export const contents = [];

/* ============================================================
   Helper — TIDAK PERLU DIEDIT
   Dipakai oleh js/viewer.js dan js/floorplan.js untuk membaca
   data di atas. Diletakkan di sini supaya file ini tetap jadi
   satu-satunya sumber kebenaran untuk seluruh konten tur.
============================================================ */
export function findView(id) {
  return views.find((v) => v.id === id);
}

export function findFloor(id) {
  return floors.find((f) => f.id === id);
}

/** Cari 1 objek content lewat id-nya (dipakai saat hotspot content diklik). */
export function findContent(id) {
  return contents.find((c) => c.id === id);
}

/** Semua lantai yang punya titik menuju view ini (dipakai saat pindah view untuk tahu harus pindah tab lantai ke mana). */
export function floorsForView(viewId) {
  return floors.filter((f) => f.points.some((p) => p.target === viewId));
}

/** Label yang ditampilkan untuk sebuah target: pakai label manual kalau ada, kalau tidak pakai title dari view tujuannya. */
export function labelForTarget(targetId, explicitLabel) {
  if (explicitLabel) return explicitLabel;
  const v = findView(targetId);
  return v ? v.title : targetId;
}
