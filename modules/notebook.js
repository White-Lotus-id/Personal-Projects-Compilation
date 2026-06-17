/**
 * notebook.js - Notebook business logic layer.
 *
 * Sits between the UI and db.js.
 * Handles create, rename, delete, and load operations.
 */

import { createNotebook, getNotebook, getAllNotebooks } from "../lib/db.js";

/**
 * Creates a new notebook, saves it to IndexedDB, and returns the record.
 * @param {string} title
 * @returns {Promise<object>} The saved notebook record
 */
export async function createNewNotebook(title) {
  if (!title || !title.trim()) throw new Error("Notebook title cannot be empty.");
  return createNotebook(title.trim());
}

/**
 * Loads a notebook by ID.
 * @param {string} id
 * @returns {Promise<object>} The notebook record
 */
export async function loadNotebook(id) {
  const notebook = await getNotebook(id);
  if (!notebook) throw new Error(`Notebook not found: ${id}`);
  return notebook;
}

/**
 * Returns the most recently updated notebook, or null if none exist.
 * Used to restore the last open notebook on app start.
 * @returns {Promise<object|null>}
 */
export async function getMostRecentNotebook() {
  const notebooks = await getAllNotebooks();
  return notebooks.length > 0 ? notebooks[0] : null;
}
