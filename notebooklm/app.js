/**
 * app.js - Application entry point.
 *
 * Boot sequence:
 * 1. Open IndexedDB (must happen before any db call)
 * 2. Bind all UI event listeners
 * 3. Render the sidebar notebook list
 * 4. Restore the last open notebook (or show empty state)
 */

import { openDB }                               from "./lib/db.js";
import { createNewNotebook, loadNotebook, getMostRecentNotebook } from "./modules/notebook.js";
import { initSidebar, renderSidebar, setActiveNotebook } from "./ui/sidebar.js";
import { openNotebook, bindChatEvents }          from "./ui/chatview.js";
import { showSettings, hideSettings, bindSettingsEvents } from "./ui/settings.js";

// ============================================================
// Boot
// ============================================================

async function init() {
  try {
    await openDB();
  } catch (err) {
    _showFatalError(err);
    return;
  }

  // Wire sidebar so it knows how to open a notebook
  initSidebar(_selectNotebook);

  // Bind all UI interactions
  bindChatEvents();
  bindSettingsEvents();
  _bindGlobalEvents();

  // Render the sidebar notebook list
  await renderSidebar();

  // Restore the last open notebook, or show the empty state
  const recent = await getMostRecentNotebook();
  if (recent) {
    await _selectNotebook(recent.id);
  } else {
    _showEmptyState();
  }
}

// ============================================================
// Notebook selection
// ============================================================

/**
 * Opens a notebook in the chat panel and highlights it in the sidebar.
 * @param {string} notebookId
 */
async function _selectNotebook(notebookId) {
  try {
    const notebook = await loadNotebook(notebookId);
    setActiveNotebook(notebookId);
    await openNotebook(notebookId, notebook.title);
  } catch (err) {
    console.error("Failed to open notebook:", err);
  }
}

// ============================================================
// Global event bindings
// ============================================================

function _bindGlobalEvents() {
  // "New notebook" button in sidebar header
  document.getElementById("btn-new-notebook").addEventListener("click", _openNewNotebookModal);

  // "Create your first notebook" button in empty state
  document.getElementById("btn-new-notebook-empty").addEventListener("click", _openNewNotebookModal);

  // Settings icon
  document.getElementById("btn-settings").addEventListener("click", showSettings);

  // New notebook modal
  document.getElementById("btn-close-notebook-modal").addEventListener("click", _closeNewNotebookModal);
  document.getElementById("btn-save-notebook").addEventListener("click", _handleCreateNotebook);
  document.getElementById("notebook-modal-overlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) _closeNewNotebookModal();
  });

  // Submit modal on Enter key
  document.getElementById("input-notebook-title").addEventListener("keydown", (e) => {
    if (e.key === "Enter") _handleCreateNotebook();
  });
}

function _openNewNotebookModal() {
  document.getElementById("input-notebook-title").value = "";
  document.getElementById("notebook-modal-overlay").classList.remove("hidden");
  document.getElementById("input-notebook-title").focus();
}

function _closeNewNotebookModal() {
  document.getElementById("notebook-modal-overlay").classList.add("hidden");
}

async function _handleCreateNotebook() {
  const titleInput = document.getElementById("input-notebook-title");
  const title      = titleInput.value.trim();

  if (!title) {
    titleInput.focus();
    return;
  }

  _closeNewNotebookModal();

  try {
    const notebook = await createNewNotebook(title);
    await renderSidebar();
    await _selectNotebook(notebook.id);
  } catch (err) {
    console.error("Failed to create notebook:", err);
  }
}

// ============================================================
// Helpers
// ============================================================

function _showEmptyState() {
  document.getElementById("empty-state").classList.remove("hidden");
  document.getElementById("chat-panel").classList.add("hidden");
}

function _showFatalError(err) {
  const appEl = document.getElementById("app");
  if (appEl) {
    appEl.innerHTML = `
      <div style="font-family:sans-serif;padding:2rem;color:#c00;">
        <strong>Error: Failed to open the database.</strong><br>
        ${err.message}<br><br>
        Try refreshing, or check that your browser allows IndexedDB storage.
      </div>
    `;
  }
}

// ============================================================
// Entry point
// ============================================================

document.addEventListener("DOMContentLoaded", init);
