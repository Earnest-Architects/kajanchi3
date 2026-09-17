/**
 * ============================================================
 *  notes-api.js — komunikasi ke Worker Cloudflare (data catatan)
 * ============================================================
 * Dipakai oleh:
 *   - note-finder.js  (menulis / mengedit / menghapus catatan)
 *   - viewer.js       (menampilkan catatan yang sudah ada -> GET)
 *
 * Format 1 objek "note":
 *   {
 *     id        : string, unik, dibuat oleh Worker
 *     view      : id gambar 360 (harus sama dengan salah satu
 *                 "id" di array `views`, js/content.js)
 *     pitch,yaw : posisi hotspot di dalam gambar 360
 *     text      : isi catatan (boleh kosong kalau ada gambar)
 *     image     : data URL base64 gambar (opsional, boleh kosong)
 *     createdAt : timestamp (ms) dibuat oleh Worker
 *   }
 *
 * SENGAJA TANPA proteksi kepemilikan — siapa pun yang membuka
 * note-finder.html bisa mengedit/menghapus catatan siapa saja,
 * kapan saja (lihat cloudflare-worker/worker.js). Cocok untuk situs
 * yang hanya diakses segelintir orang terpercaya.
 * ============================================================ */
import { NOTES_API_URL } from "./notes-config.js";

/** Ambil semua catatan yang sudah tersimpan. */
export async function fetchNotes() {
  try {
    const res = await fetch(`${NOTES_API_URL}/notes`, { method: "GET" });
    if (!res.ok) throw new Error(`GET /notes -> ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("Gagal mengambil catatan:", err);
    return [];
  }
}

/**
 * Kirim 1 catatan baru.
 * @param {{view:string, pitch:number, yaw:number, text:string, image?:string}} note
 * @returns {Promise<object>} note yang tersimpan (id & createdAt terisi).
 */
export async function submitNote(note) {
  const res = await fetch(`${NOTES_API_URL}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(note),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`POST /notes -> ${res.status} ${msg}`);
  }
  return res.json();
}

/**
 * Update teks/gambar 1 catatan yang sudah ada — siapa saja bisa
 * mengedit catatan siapa saja, tidak ada pengecekan kepemilikan.
 * @param {string} id
 * @param {{text:string, image?:string}} fields
 */
export async function updateNote(id, fields) {
  const res = await fetch(`${NOTES_API_URL}/notes/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`PUT /notes/${id} -> ${res.status} ${msg}`);
  }
  return res.json();
}

/**
 * Hapus 1 catatan — siapa saja bisa menghapus catatan siapa saja,
 * tidak ada pengecekan kepemilikan.
 * @param {string} id
 */
export async function deleteNote(id) {
  const res = await fetch(`${NOTES_API_URL}/notes/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`DELETE /notes/${id} -> ${res.status} ${msg}`);
  }
  return true;
}

/**
 * Kompres & ubah file gambar (input type="file") jadi data URL base64,
 * supaya ukurannya tidak terlalu besar untuk dikirim & disimpan.
 * Lebar gambar dibatasi max 1280px, kualitas JPEG 0.75.
 */
export function imageFileToDataUrl(file, maxWidth = 1280, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Gagal membaca file gambar."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("File bukan gambar yang valid."));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
