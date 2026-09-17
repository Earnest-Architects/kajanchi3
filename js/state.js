/**
 * ============================================================
 *  state.js — status "view mana yang sedang aktif" + event bus
 * ============================================================
 * File ini murni logika, bukan konten — jangan edit di sini
 * untuk menambah/mengubah tur. Semua konten ada di content.js.
 *
 * tourEvents adalah event bus kecil dalam-memori supaya viewer.js
 * dan floorplan.js bisa saling memberi tahu tanpa saling import
 * satu sama lain secara langsung.
 * ============================================================
 */

const listeners = {};

export const tourEvents = {
  on(event, fn) {
    (listeners[event] ||= []).push(fn);
    return () => {
      listeners[event] = listeners[event].filter((f) => f !== fn);
    };
  },
  emit(event, detail) {
    (listeners[event] || []).forEach((fn) => fn(detail));
  },
};

let currentViewId = null;

export function getCurrentViewId() {
  return currentViewId;
}

export function setCurrentView(id) {
  currentViewId = id;
  tourEvents.emit("scenechange", { id });
}
