/**
 * ============================================================
 *  notes-config.js — SATU-SATUNYA FILE YANG PERLU DIEDIT
 *  untuk menyambungkan fitur "Catatan Hotspot" ke Worker Cloudflare.
 * ============================================================
 * Setelah Worker di Cloudflare selesai di-deploy (lihat
 * cloudflare-worker/README.md), URL Worker-nya akan terlihat
 * seperti:
 *
 *   https://nama-worker-kamu.username.workers.dev
 *
 * Tempel URL itu di bawah ini (TANPA garis miring "/" di akhir).
 * ============================================================ */
export const NOTES_API_URL = "https://notes-hotspot-api.vtour.workers.dev";
