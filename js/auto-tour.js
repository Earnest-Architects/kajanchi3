/**
 * ============================================================
 *  auto-tour.js — AUTO TOUR (360 smooth rotate automation)
 * ============================================================
 * Tombol ▶ di icon-rail. Klik sekali:
 *   1) masuk fullscreen (seluruh #app, supaya kontrol di bawah
 *      ini tetap kelihatan & bisa diklik saat fullscreen)
 *   2) musik latar (assets/bgm/*.mp3) diputar looping selama
 *      mode aktif (lagu berikutnya otomatis lanjut saat lagu
 *      sebelumnya habis, lalu balik ke lagu pertama lagi)
 *   3) 360 auto-rotate di scene pertama sesuai `autoTour.sequence`
 *      di content.js, lalu pindah ke scene berikutnya dengan
 *      transisi fade-to-black, dan seterusnya berurutan &
 *      berulang selama mode masih aktif. Arah rotasi bergantian
 *      kiri/kanan tiap scene.
 * Klik lagi (atau keluar fullscreen) untuk menghentikan sepenuhnya.
 *
 * Selama mode aktif, muncul 4 tombol kontrol tambahan:
 *   - Prev / Next  : lompat ke scene sebelumnya/berikutnya di urutan.
 *   - Play/Pause   : jeda rotasi + musik bersamaan (posisi musik
 *                    tetap tersimpan), atau lanjutkan lagi.
 *   - Hide/Show    : sembunyikan/tampilkan semua ikon hotspot.
 * ============================================================
 */
import { viewer } from "./viewer.js";
import { autoTour } from "./content.js";

const appEl = document.getElementById("app");
const playBtn = document.getElementById("auto-tour-btn");
const panoramaEl = document.getElementById("panorama");
const controlsBar = document.getElementById("auto-tour-controls");
const prevBtn = document.getElementById("auto-tour-prev-btn");
const pauseBtn = document.getElementById("auto-tour-pause-btn");
const nextBtn = document.getElementById("auto-tour-next-btn");
const hotspotsBtn = document.getElementById("auto-tour-hotspots-btn");

const PLAY_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const STOP_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
const PAUSE_ICON = STOP_ICON;
const EYE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 4.22-5.94M9.9 4.24A9.5 9.5 0 0 1 12 4c7 0 11 8 11 8a20.3 20.3 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>';

const hasAllControls = playBtn && panoramaEl && controlsBar && prevBtn && pauseBtn && nextBtn && hotspotsBtn;

if (hasAllControls && autoTour && autoTour.sequence && autoTour.sequence.length) {
  const music = document.createElement("audio");
  music.preload = "auto";
  document.body.appendChild(music);

  let active = false;
  let paused = false;
  let hotspotsHidden = false;
  let manualJump = false;
  let trackIndex = 0;
  let sequencePos = 0;

  /* ---------- Timer yang bisa dijeda/dilanjutkan (untuk pause) ---------- */
  let waitState = null; // { resolve, remaining, timer, startedAt }

  function armWait() {
    if (!waitState) return;
    waitState.startedAt = Date.now();
    waitState.timer = setTimeout(() => {
      const w = waitState;
      waitState = null;
      w.resolve();
    }, Math.max(0, waitState.remaining));
  }
  function wait(ms) {
    return new Promise((resolve) => {
      waitState = { resolve, remaining: ms, timer: null, startedAt: 0 };
      if (!paused) armWait();
    });
  }
  function pauseWaitTimer() {
    if (!waitState || waitState.timer === null) return;
    clearTimeout(waitState.timer);
    waitState.remaining -= Date.now() - waitState.startedAt;
    waitState.timer = null;
  }
  function resumeWaitTimer() {
    if (!waitState) return;
    armWait();
  }
  function skipWait() {
    if (!waitState) return;
    clearTimeout(waitState.timer);
    const w = waitState;
    waitState = null;
    w.resolve();
  }

  /* ---------- Musik latar (looping bergantian antar file) ---------- */
  function playNextTrack() {
    if (!active || paused || !autoTour.music.length) return;
    music.src = autoTour.music[trackIndex % autoTour.music.length];
    trackIndex++;
    music.play().catch(() => {
      /* diblokir autoplay policy — akan lanjut lewat gesture klik tombol ini sendiri */
    });
  }
  music.addEventListener("ended", playNextTrack);

  function clearOverlays() {
    panoramaEl.querySelectorAll(".auto-tour-fade-overlay").forEach((el) => el.remove());
  }

  /* ---------- Sinyal "scene beneran udah siap" ----------
   * viewer.loadScene() Pannellum itu punya fade internal sendiri
   * (sceneFadeDuration) yang nge-snapshot scene LAMA dan naruhnya
   * jadi overlay di atas scene baru sampai gambar baru kelar
   * dimuat — makanya walau overlay hitam kita udah nutup, scene
   * lama masih "nyangkut" kelihatan pas overlay kita buka lagi.
   * Makanya overlay hitam kita ini yang jadi satu-satunya transisi:
   * fade internal Pannellum dimatikan (disableSceneFade) tiap kali
   * kita manggil loadScene, jadi gantinya langsung switch instan
   * di balik layar hitam kita, bersih tanpa sisa scene lama.
   *
   * "scenechange" = config scene baru udah aktif (di titik ini baru
   * aman manggil startAutoRotate, karena sebelum ini settingannya
   * masih bisa ke-reset ulang oleh Pannellum).
   * "load"        = gambar panorama baru udah BENERAN kelar dimuat
   *                 (baru di titik ini aman buka overlay hitam lagi). */
  let sceneReadyResolve = null;
  viewer.on("scenechange", () => {
    if (sceneReadyResolve) {
      const resolve = sceneReadyResolve;
      sceneReadyResolve = null;
      resolve();
    }
  });
  function waitSceneReady() {
    return new Promise((resolve) => {
      sceneReadyResolve = resolve;
    });
  }

  let sceneLoadResolve = null;
  viewer.on("load", () => {
    if (sceneLoadResolve) {
      const resolve = sceneLoadResolve;
      sceneLoadResolve = null;
      resolve();
    }
  });
  function waitSceneLoaded() {
    return new Promise((resolve) => {
      sceneLoadResolve = resolve;
    });
  }

  function disableSceneFade() {
    const cfg = viewer.getConfig();
    if (cfg) cfg.sceneFadeDuration = 0;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Transisi fade-to-black ke scene berikutnya: layar gelap dulu
   *  (half durasi), scene diganti (fade internal Pannellum
   *  dimatikan supaya bersih, tanpa sisa scene lama) & rotasi mulai
   *  jalan SAAT MASIH GELAP, baru layar terang lagi (half durasi)
   *  SETELAH panorama barunya beneran kelar dimuat — jadi begitu
   *  kelihatan, scene baru udah utuh & udah muter duluan. */
  async function transitionTo(nextId) {
    const half = Math.max(0, autoTour.transitionDuration / 2);

    const overlay = document.createElement("div");
    overlay.className = "auto-tour-fade-overlay";
    panoramaEl.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.style.transition = `opacity ${half}ms ease`;
      overlay.style.opacity = "1";
    });
    await sleep(half);
    if (!active) {
      overlay.remove();
      return;
    }

    const ready = waitSceneReady();
    const loaded = waitSceneLoaded();
    disableSceneFade();
    viewer.loadScene(nextId);
    await ready;

    if (!active) {
      overlay.remove();
      return;
    }
    startRotationForCurrentStep();

    await loaded;
    if (!active) {
      overlay.remove();
      return;
    }

    requestAnimationFrame(() => {
      overlay.style.opacity = "0";
    });
    await sleep(half);
    overlay.remove();
  }

  function startRotationForCurrentStep() {
    if (paused) return;
    // Arah rotasi bervariasi: scene index genap muter satu arah,
    // ganjil muter arah sebaliknya.
    const direction = sequencePos % 2 === 0 ? 1 : -1;
    viewer.startAutoRotate(autoTour.rotateSpeed * direction);
    // Aktifkan auto-resume bawaan Pannellum: drag manual (mouse/
    // sentuh) otomatis menghentikan rotasi selama drag berlangsung,
    // lalu rotasi otomatis lanjut lagi `resumeDelay` ms setelah
    // dilepas — tanpa perlu kode drag-listener manual di sini.
    viewer.getConfig().autoRotateInactivityDelay = autoTour.resumeDelay ?? 3000;
  }

  async function runSequence() {
    while (active) {
      const step = autoTour.sequence[sequencePos];

      // Semua perpindahan scene (termasuk yang pertama kali PLAY
      // ditekan) lewat transisi fade-to-black yang sama, jadi
      // konsisten dan gak ada lompatan mendadak.
      await transitionTo(step.id);
      if (!active) return;

      await wait(step.duration);
      if (!active) return;

      viewer.stopAutoRotate();
      if (!manualJump) {
        sequencePos = (sequencePos + 1) % autoTour.sequence.length;
      }
      manualJump = false;
    }
  }

  /* ---------- Prev / Next ---------- */
  function goRelative(delta) {
    if (!active) return;
    manualJump = true;
    viewer.stopAutoRotate();
    sequencePos = (sequencePos + delta + autoTour.sequence.length) % autoTour.sequence.length;
    skipWait();
  }
  prevBtn.addEventListener("click", () => goRelative(-1));
  nextBtn.addEventListener("click", () => goRelative(1));

  /* ---------- Pause / Resume (rotasi + musik bareng) ---------- */
  function setPauseIcon(isPaused) {
    pauseBtn.innerHTML = isPaused ? PLAY_ICON : PAUSE_ICON;
    pauseBtn.setAttribute("aria-label", isPaused ? "Resume auto tour" : "Pause auto tour");
    pauseBtn.setAttribute("title", isPaused ? "Resume auto tour" : "Pause auto tour");
  }
  function pauseTour() {
    if (!active || paused) return;
    paused = true;
    viewer.stopAutoRotate();
    music.pause();
    pauseWaitTimer();
    setPauseIcon(true);
  }
  function resumeTour() {
    if (!active || !paused) return;
    paused = false;
    startRotationForCurrentStep();
    if (music.src) music.play().catch(() => {});
    resumeWaitTimer();
    setPauseIcon(false);
  }
  pauseBtn.addEventListener("click", () => (paused ? resumeTour() : pauseTour()));

  /* ---------- Hide / Show hotspot ---------- */
  function setHotspotsHidden(hidden) {
    hotspotsHidden = hidden;
    panoramaEl.classList.toggle("hotspots-hidden", hidden);
    hotspotsBtn.innerHTML = hidden ? EYE_OFF_ICON : EYE_ICON;
    hotspotsBtn.setAttribute("aria-label", hidden ? "Show hotspots" : "Hide hotspots");
    hotspotsBtn.setAttribute("title", hidden ? "Show hotspots" : "Hide hotspots");
  }
  hotspotsBtn.addEventListener("click", () => setHotspotsHidden(!hotspotsHidden));

  /* ---------- Tombol utama ▶ (mulai/berhenti sepenuhnya) ---------- */
  function setIcon(playing) {
    playBtn.innerHTML = playing ? STOP_ICON : PLAY_ICON;
    playBtn.setAttribute("aria-label", playing ? "Stop auto tour" : "Play auto tour");
    playBtn.setAttribute("title", playing ? "Stop auto tour" : "Play auto tour");
  }

  function requestFullscreenOnApp() {
    if (document.fullscreenElement) return;
    const req = appEl.requestFullscreen || appEl.webkitRequestFullscreen || appEl.msRequestFullscreen;
    if (req) {
      try {
        req.call(appEl);
      } catch (err) {
        /* fullscreen tidak didukung/diblokir — lanjut tanpa fullscreen */
      }
    }
  }
  function exitFullscreenIfOurs() {
    if (!document.fullscreenElement) return;
    const exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (exit) exit.call(document);
  }

  function start() {
    active = true;
    paused = false;
    sequencePos = 0;
    trackIndex = 0;
    playBtn.classList.add("is-active");
    setIcon(true);
    setPauseIcon(false);
    controlsBar.classList.remove("hidden");
    playNextTrack();
    requestFullscreenOnApp();
    runSequence();
  }

  function stop() {
    active = false;
    paused = false;
    skipWait();
    viewer.stopAutoRotate();
    music.pause();
    clearOverlays();
    setHotspotsHidden(false);
    playBtn.classList.remove("is-active");
    setIcon(false);
    setPauseIcon(false);
    controlsBar.classList.add("hidden");
    exitFullscreenIfOurs();
  }

  playBtn.addEventListener("click", () => (active ? stop() : start()));

  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && active) stop();
  });

  setIcon(false);
}
