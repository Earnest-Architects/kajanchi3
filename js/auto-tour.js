/**
 * ============================================================
 *  auto-tour.js — AUTO TOUR (360 smooth rotate automation)
 * ============================================================
 * Tombol ▶ di icon-rail. Klik sekali:
 *   1) masuk fullscreen
 *   2) musik latar (assets/bgm/*.mp3) diputar looping selama
 *      mode aktif (lagu berikutnya otomatis lanjut saat lagu
 *      sebelumnya habis, lalu balik ke lagu pertama lagi)
 *   3) 360 auto-rotate di scene pertama sesuai `autoTour.sequence`
 *      di content.js, lalu pindah ke scene berikutnya dengan
 *      transisi crossfade + blur, dan seterusnya berurutan &
 *      berulang selama mode masih aktif.
 * Klik lagi (atau keluar fullscreen) untuk menghentikan.
 * ============================================================
 */
import { viewer } from "./viewer.js";
import { autoTour } from "./content.js";

const playBtn = document.getElementById("auto-tour-btn");
const panoramaEl = document.getElementById("panorama");

const PLAY_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const STOP_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';

if (playBtn && panoramaEl && autoTour && autoTour.sequence && autoTour.sequence.length) {
  const music = document.createElement("audio");
  music.preload = "auto";
  document.body.appendChild(music);

  let active = false;
  let trackIndex = 0;
  let sequencePos = 0;
  let stepTimer = null;

  function sleep(ms) {
    return new Promise((resolve) => {
      stepTimer = setTimeout(resolve, ms);
    });
  }

  function playNextTrack() {
    if (!active || !autoTour.music.length) return;
    music.src = autoTour.music[trackIndex % autoTour.music.length];
    trackIndex++;
    music.play().catch(() => {
      /* diblokir autoplay policy — akan lanjut lewat gesture klik tombol ini sendiri */
    });
  }
  music.addEventListener("ended", playNextTrack);

  function clearOverlays() {
    panoramaEl.querySelectorAll(".auto-tour-blur-overlay").forEach((el) => el.remove());
  }

  /** Crossfade + blur dari scene sekarang ke scene berikutnya. */
  async function crossfadeTo(nextId) {
    const canvas = panoramaEl.querySelector("canvas");
    if (!canvas) {
      viewer.loadScene(nextId);
      return;
    }
    const snap = document.createElement("canvas");
    snap.width = canvas.width;
    snap.height = canvas.height;
    snap.className = "auto-tour-blur-overlay";
    snap.getContext("2d").drawImage(canvas, 0, 0);
    panoramaEl.appendChild(snap);

    viewer.loadScene(nextId);

    requestAnimationFrame(() => {
      snap.style.transition = `filter ${autoTour.transitionDuration}ms ease, opacity ${autoTour.transitionDuration}ms ease`;
      snap.style.filter = "blur(28px)";
      snap.style.opacity = "0";
    });

    await sleep(autoTour.transitionDuration);
    snap.remove();
  }

  async function runSequence() {
    while (active) {
      const step = autoTour.sequence[sequencePos % autoTour.sequence.length];

      if (sequencePos === 0) {
        viewer.loadScene(step.id);
      } else {
        await crossfadeTo(step.id);
        if (!active) return;
      }

      viewer.startAutoRotate(autoTour.rotateSpeed);
      // Aktifkan auto-resume bawaan Pannellum: drag manual (mouse/
      // sentuh) otomatis menghentikan rotasi selama drag berlangsung,
      // lalu rotasi otomatis lanjut lagi `resumeDelay` ms setelah
      // dilepas — tanpa perlu kode drag-listener manual di sini.
      viewer.getConfig().autoRotateInactivityDelay = autoTour.resumeDelay ?? 3000;
      await sleep(step.duration);
      if (!active) return;

      viewer.stopAutoRotate();
      sequencePos++;
    }
  }

  function setIcon(playing) {
    playBtn.innerHTML = playing ? STOP_ICON : PLAY_ICON;
    playBtn.setAttribute("aria-label", playing ? "Stop auto tour" : "Play auto tour");
    playBtn.setAttribute("title", playing ? "Stop auto tour" : "Play auto tour");
  }

  function start() {
    active = true;
    sequencePos = 0;
    trackIndex = 0;
    playBtn.classList.add("is-active");
    setIcon(true);
    playNextTrack();
    if (!document.fullscreenElement) viewer.toggleFullscreen();
    runSequence();
  }

  function stop() {
    active = false;
    clearTimeout(stepTimer);
    viewer.stopAutoRotate();
    music.pause();
    clearOverlays();
    playBtn.classList.remove("is-active");
    setIcon(false);
  }

  playBtn.addEventListener("click", () => (active ? stop() : start()));

  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && active) stop();
  });

  setIcon(false);
}
