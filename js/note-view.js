/**
 * ============================================================
 *  note-view.js — buka isi 1 catatan hotspot di dalam modal
 * ============================================================
 * openNoteModal(note) tanpa argumen ke-2 -> modal baca-saja,
 * dipakai oleh viewer.js di tur utama (index.html) supaya semua
 * pengunjung bisa membaca catatan.
 *
 * openNoteModal(note, { editable: true, onEdit, onDelete }) ->
 * dipakai HANYA oleh note-finder.js, menambah footer Edit/Delete.
 * Delete punya konfirmasi 2-langkah di dalam modal itu sendiri
 * (bukan window.confirm) supaya tetap terasa halus & konsisten
 * dengan tampilan situs.
 * ============================================================ */
import { openCustomModal, closeContentModal } from "./content-modal.js";

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function formatDate(ms) {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleString("en-US", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function renderBody(note) {
  return `
    ${note.image ? `<div class="content-modal-photo"><img src="${escapeHtml(note.image)}" alt="Attached note image" /></div>` : ""}
    ${note.text ? `<p class="content-modal-text">${escapeHtml(note.text)}</p>` : ""}
    ${note.createdAt ? `<p class="note-modal-date">${escapeHtml(formatDate(note.createdAt))}${note.updatedAt ? " · edited" : ""}</p>` : ""}
  `;
}

function renderFooter(confirmingDelete) {
  if (confirmingDelete) {
    return `
      <p class="note-modal-confirm-text">Delete this note? This can't be undone.</p>
      <div class="note-modal-actions">
        <button type="button" class="note-modal-btn note-modal-btn--ghost" data-action="cancel-delete">Cancel</button>
        <button type="button" class="note-modal-btn note-modal-btn--danger" data-action="confirm-delete">Delete note</button>
      </div>
    `;
  }
  return `
    <div class="note-modal-actions">
      <button type="button" class="note-modal-btn note-modal-btn--ghost" data-action="edit">Edit</button>
      <button type="button" class="note-modal-btn note-modal-btn--danger" data-action="delete">Delete</button>
    </div>
  `;
}

/**
 * @param {{text?:string, image?:string, createdAt?:number, updatedAt?:number}} note
 * @param {{editable?:boolean, onEdit?:Function, onDelete?:Function}} [options]
 */
export function openNoteModal(note, options = {}) {
  const { editable = false, onEdit = null, onDelete = null } = options;
  const body = renderBody(note);

  if (!editable) {
    openCustomModal("💬 Note", body);
    return;
  }

  const open = (confirmingDelete) => {
    openCustomModal("💬 Note", body, {
      footerHtml: renderFooter(confirmingDelete),
      onFooterClick: (action) => {
        if (action === "edit") {
          closeContentModal();
          if (onEdit) onEdit();
        } else if (action === "delete") {
          open(true);
        } else if (action === "cancel-delete") {
          open(false);
        } else if (action === "confirm-delete") {
          closeContentModal();
          if (onDelete) onDelete();
        }
      },
    });
  };
  open(false);
}
