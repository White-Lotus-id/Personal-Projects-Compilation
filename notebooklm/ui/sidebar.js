/**
 * sidebar.js - Left sidebar: notebook list, navigation, context menu.
 *
 * Responsibilities:
 * - Render all notebooks from IndexedDB
 * - Highlight the active notebook
 * - Handle click to open a notebook
 * - Handle rename and delete via a context menu
 */

import { getAllNotebooks, deleteNotebook, updateNotebook } from "../lib/db.js";

// Callback set by app.js so the sidebar can trigger notebook loading
let _onNotebookSelect = null;

/** Currently active notebook ID */
let _activeId = null;

/**
 * Initialises the sidebar with a callback for when a notebook is selected.
 * @param {function} onSelect - Called with (notebookId) when a notebook is clicked
 */
export function initSidebar(onSelect) {
  _onNotebookSelect = onSelect;
}

/**
 * Fetches all notebooks and re-renders the list.
 * Call after any create/rename/delete operation.
 */
export async function renderSidebar() {
  const notebooks = await getAllNotebooks();
  const list      = document.getElementById("notebook-list");

  list.innerHTML = "";

  if (notebooks.length === 0) {
    list.innerHTML = `<li class="sidebar-empty-hint">No notebooks yet.</li>`;
    return;
  }

  for (const nb of notebooks) {
    list.appendChild(_createNotebookItem(nb));
  }
}

/**
 * Marks a notebook as the active (highlighted) item in the list.
 * @param {string} id
 */
export function setActiveNotebook(id) {
  _activeId = id;
  document.querySelectorAll(".notebook-item").forEach(el => {
    el.classList.toggle("active", el.dataset.id === id);
  });
}

// --- Private helpers ---

function _createNotebookItem(notebook) {
  const li = document.createElement("li");
  li.className     = "notebook-item";
  li.dataset.id    = notebook.id;
  if (_activeId === notebook.id) li.classList.add("active");

  li.innerHTML = `
    <span class="notebook-item-title">${_escapeHtml(notebook.title)}</span>
    <button class="notebook-item-menu" title="More options">···</button>
  `;

  li.addEventListener("click", (e) => {
    if (e.target.classList.contains("notebook-item-menu")) return;
    if (_onNotebookSelect) _onNotebookSelect(notebook.id);
  });

  li.querySelector(".notebook-item-menu").addEventListener("click", (e) => {
    e.stopPropagation();
    _showContextMenu(e, notebook);
  });

  return li;
}

function _showContextMenu(e, notebook) {
  // Remove any existing context menu
  _removeContextMenu();

  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.id        = "context-menu";
  menu.innerHTML = `
    <button class="context-menu-item" data-action="rename">Rename</button>
    <button class="context-menu-item danger" data-action="delete">Delete</button>
  `;

  // Position near the click
  menu.style.left = `${Math.min(e.clientX, window.innerWidth - 160)}px`;
  menu.style.top  = `${e.clientY + 4}px`;

  document.body.appendChild(menu);

  menu.addEventListener("click", async (evt) => {
    const action = evt.target.dataset.action;
    _removeContextMenu();

    if (action === "rename") await _handleRename(notebook);
    if (action === "delete") await _handleDelete(notebook);
  });

  // Close on outside click
  setTimeout(() => {
    document.addEventListener("click", _removeContextMenu, { once: true });
  }, 0);
}

function _removeContextMenu() {
  document.getElementById("context-menu")?.remove();
}

async function _handleRename(notebook) {
  const newTitle = prompt("New notebook name:", notebook.title);
  if (!newTitle || newTitle.trim() === notebook.title) return;

  await updateNotebook(notebook.id, { title: newTitle.trim() });
  await renderSidebar();

  // Update the title shown in the top bar if this is the active notebook
  if (_activeId === notebook.id) {
    const el = document.getElementById("notebook-title");
    if (el) el.textContent = newTitle.trim();
  }
}

async function _handleDelete(notebook) {
  const confirmed = confirm(`Delete "${notebook.title}"? This cannot be undone.`);
  if (!confirmed) return;

  await deleteNotebook(notebook.id);

  // If the deleted notebook was active, return to empty state
  if (_activeId === notebook.id) {
    _activeId = null;
    _showEmptyState();
  }

  await renderSidebar();
}

function _showEmptyState() {
  document.getElementById("empty-state").classList.remove("hidden");
  document.getElementById("chat-panel").classList.add("hidden");
}

function _escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
