/**
 * ============================================================
 *  google-translate.js — tombol "Terjemahkan halaman" (seperti Chrome)
 * ============================================================
 * SEMUA konten situs ini ditulis dalam bahasa Inggris di content.js
 * seperti biasa — TIDAK ADA kamus terjemahan manual yang perlu
 * diisi. Untuk bahasa lain, seluruh teks di halaman diterjemahkan
 * LANGSUNG oleh mesin Google Translate (persis fitur "Terjemahkan
 * halaman ini" bawaan Chrome), lewat widget resmi Google
 * (translate.google.com) yang gratis & tanpa API key.
 *
 * Tampilan yang dilihat pengunjung: ikon bola dunia (pojok kiri
 * bawah homepage) -> klik -> muncul popup daftar bahasa bergaya
 * sama seperti UI situs -> pilih bahasa -> beberapa detik kemudian
 * semua teks di halaman berubah bahasa. Tampilan dropdown bawaan
 * Google sendiri (yang kotak & tidak sesuai desain situs)
 * disembunyikan lewat CSS — lihat #lang-switcher di css/style.css —
 * cuma "mesin"-nya saja yang dipakai, bukan tampilannya.
 *
 * BATASAN PENTING (tidak bisa diakali, ini keterbatasan teknis):
 * Google Translate hanya bisa menerjemahkan teks yang benar-benar
 * berupa HTML (DOM) — jadi homepage ini dan jendela pop-up 2D-nya
 * (content-modal.js) bisa full diterjemahkan. Teks di DALAM VR
 * (panel content 3D di vr.html) digambar sebagai tekstur 3D lewat
 * komponen "text" A-Frame, BUKAN teks HTML biasa, jadi TIDAK bisa
 * ikut diterjemahkan — akan tetap bahasa Inggris walau pengunjung
 * sudah pilih bahasa lain di homepage. Widget ini sengaja HANYA
 * dipasang di homepage (lihat pemanggilan initLanguageSwitcher()
 * di viewer.js), tidak di vr.html.
 * ============================================================ */

const LANGS = [
  { code: "en", label: "English" },
  { code: "id", label: "Bahasa Indonesia" },
  { code: "ja", label: "日本語" },
  { code: "zh-CN", label: "中文" },
];

let comboReadyPromise = null;

/** Tunggu sampai widget Google Translate selesai memuat & elemen
 *  <select class="goog-te-combo"> (dropdown bahasa asli, disembunyikan
 *  lewat CSS) sudah ada di DOM — itu "remote control"-nya yang kita
 *  pakai lewat UI custom kita sendiri. */
function waitForGoogleCombo() {
  if (comboReadyPromise) return comboReadyPromise;
  comboReadyPromise = new Promise((resolve) => {
    const check = () => {
      const combo = document.querySelector(".goog-te-combo");
      if (combo) resolve(combo);
      else setTimeout(check, 200);
    };
    check();
  });
  return comboReadyPromise;
}

function injectGoogleTranslateScript() {
  if (window.__gtInitDone) return;
  window.__gtInitDone = true;

  const container = document.createElement("div");
  container.id = "google_translate_element";
  document.body.appendChild(container);

  window.googleTranslateElementInit = function () {
    // eslint-disable-next-line no-undef
    new google.translate.TranslateElement(
      {
        pageLanguage: "en",
        includedLanguages: LANGS.map((l) => l.code).join(","),
        autoDisplay: false,
      },
      "google_translate_element"
    );
  };

  const script = document.createElement("script");
  script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
  script.async = true;
  document.head.appendChild(script);
}

/** Ganti bahasa lewat widget Google Translate. code="en" = balik ke
 *  teks asli (memilih opsi kosong pada dropdown asli Google, itu
 *  perilaku bawaan untuk "Show original"). */
function setGoogleLang(code) {
  waitForGoogleCombo().then((combo) => {
    combo.value = code === "en" ? "" : code;
    combo.dispatchEvent(new Event("change"));
  });
}

/* ============================================================
   UI: ikon bola dunia + popup daftar bahasa, dipasang sekali di
   homepage lewat viewer.js.
============================================================ */
export function initLanguageSwitcher() {
  if (document.getElementById("lang-switcher")) return;
  injectGoogleTranslateScript();

  const wrap = document.createElement("div");
  wrap.id = "lang-switcher";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "rail-btn lang-switcher-btn";
  btn.setAttribute("aria-label", "Change language");
  btn.setAttribute("title", "Change language");
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="9.2"/>
      <path d="M2.8 12h18.4"/>
      <path d="M12 2.8c2.6 2.5 4 5.8 4 9.2s-1.4 6.7-4 9.2c-2.6-2.5-4-5.8-4-9.2s1.4-6.7 4-9.2z"/>
    </svg>
  `;

  const popup = document.createElement("div");
  popup.id = "lang-switcher-popup";
  popup.hidden = true;
  popup.setAttribute("role", "menu");
  popup.innerHTML = `
    <p class="lang-switcher-title">Select language</p>
    <div class="lang-switcher-list">
      ${LANGS.map(
        (l) => `<button type="button" class="lang-switcher-option" data-lang="${l.code}" role="menuitem">${l.label}</button>`
      ).join("")}
    </div>
  `;

  function closePopup() {
    popup.hidden = true;
    btn.classList.remove("is-active");
  }
  function togglePopup() {
    popup.hidden = !popup.hidden;
    btn.classList.toggle("is-active", !popup.hidden);
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    togglePopup();
  });
  popup.querySelectorAll(".lang-switcher-option").forEach((optEl) => {
    optEl.addEventListener("click", () => {
      setGoogleLang(optEl.dataset.lang);
      closePopup();
    });
  });
  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) closePopup();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePopup();
  });

  wrap.appendChild(btn);
  wrap.appendChild(popup);
  (document.getElementById("icon-rail") || document.body).appendChild(wrap);
}
