/**
 * db.js - IndexedDB database layer for NotepadLM
 *
 * Single source of truth for all local storage.
 * Every piece of data lives in IndexedDB and is accessed through the functions below.
 *
 * Keys and provider defaults now come from config.js.
 * Users never need to type an API key manually.
 */

import { CONFIG } from "../config.js";

const DB_NAME    = "NotepadLM";
const DB_VERSION = 1;

const STORES = Object.freeze({
  NOTEBOOKS: "notebooks",
  DOCUMENTS: "documents",
  CHUNKS:    "chunks",
  CHATS:     "chats",
  SETTINGS:  "settings",
});

// Open DB connection, reused across all operations
let _db = null;

/**
 * Opens or creates the IndexedDB database.
 * Call once on startup in app.js before anything else.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      _createStores(event.target.result, event.oldVersion);
    };

    request.onsuccess = (event) => {
      _db = event.target.result;
      _db.onerror = (err) => console.error("IndexedDB error:", err);
      resolve(_db);
    };

    request.onerror = (event) => {
      reject(new Error(`Failed to open database: ${event.target.error}`));
    };
  });
}

function _createStores(db, oldVersion) {
  if (oldVersion < 1) {
    const notebooks = db.createObjectStore(STORES.NOTEBOOKS, { keyPath: "id" });
    notebooks.createIndex("updatedAt", "updatedAt");

    const documents = db.createObjectStore(STORES.DOCUMENTS, { keyPath: "id" });
    documents.createIndex("notebookId", "notebookId");

    const chunks = db.createObjectStore(STORES.CHUNKS, { keyPath: "id" });
    chunks.createIndex("documentId", "documentId");
    chunks.createIndex("notebookId", "notebookId");

    const chats = db.createObjectStore(STORES.CHATS, { keyPath: "id" });
    chats.createIndex("notebookId", "notebookId");
    chats.createIndex("createdAt",  "createdAt");

    db.createObjectStore(STORES.SETTINGS, { keyPath: "id" });
  }
}

// --- Generic helpers ---

function _getStore(storeName, mode = "readonly") {
  if (!_db) {
    throw new Error("Database not open. Call openDB() first.");
  }
  const tx    = _db.transaction(storeName, mode);
  const store = tx.objectStore(storeName);
  return { tx, store };
}

function _requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror   = () => reject(request.error);
  });
}

function generateId() {
  return crypto.randomUUID();
}

function now() {
  return Date.now();
}

// --- Notebooks ---

async function createNotebook(title, description = "") {
  const notebook = {
    id:          generateId(),
    title:       title.trim(),
    description: description.trim(),
    createdAt:   now(),
    updatedAt:   now(),
  };
  const { store } = _getStore(STORES.NOTEBOOKS, "readwrite");
  await _requestToPromise(store.add(notebook));
  return notebook;
}

async function getAllNotebooks() {
  const { store } = _getStore(STORES.NOTEBOOKS);
  const notebooks = await _requestToPromise(store.getAll());
  return notebooks.sort((a, b) => b.updatedAt - a.updatedAt);
}

async function getNotebook(id) {
  const { store } = _getStore(STORES.NOTEBOOKS);
  return _requestToPromise(store.get(id));
}

async function updateNotebook(id, changes) {
  const existing = await getNotebook(id);
  if (!existing) throw new Error(`Notebook not found: ${id}`);
  const updated = { ...existing, ...changes, updatedAt: now() };
  const { store } = _getStore(STORES.NOTEBOOKS, "readwrite");
  await _requestToPromise(store.put(updated));
  return updated;
}

async function deleteNotebook(id) {
  await deleteDocumentsByNotebook(id);
  await deleteChunksByNotebook(id);
  await deleteChatsByNotebook(id);
  const { store } = _getStore(STORES.NOTEBOOKS, "readwrite");
  await _requestToPromise(store.delete(id));
}

// --- Documents ---

async function createDocument(notebookId, filename, type, rawText) {
  const doc = {
    id:             generateId(),
    notebookId,
    filename:       filename.trim(),
    type,
    rawText,
    characterCount: rawText.length,
    createdAt:      now(),
  };
  const { store } = _getStore(STORES.DOCUMENTS, "readwrite");
  await _requestToPromise(store.add(doc));
  return doc;
}

async function getDocumentsByNotebook(notebookId) {
  const { store } = _getStore(STORES.DOCUMENTS);
  const index     = store.index("notebookId");
  return _requestToPromise(index.getAll(notebookId));
}

async function getDocument(id) {
  const { store } = _getStore(STORES.DOCUMENTS);
  return _requestToPromise(store.get(id));
}

async function deleteDocument(id) {
  await deleteChunksByDocument(id);
  const { store } = _getStore(STORES.DOCUMENTS, "readwrite");
  await _requestToPromise(store.delete(id));
}

async function deleteDocumentsByNotebook(notebookId) {
  const docs = await getDocumentsByNotebook(notebookId);
  for (const doc of docs) {
    await deleteDocument(doc.id);
  }
}

// --- Chunks ---

async function createChunk(documentId, notebookId, text, index, embedding) {
  const chunk = {
    id: generateId(),
    documentId,
    notebookId,
    text,
    index,
    embedding,
    createdAt: now(),
  };
  const { store } = _getStore(STORES.CHUNKS, "readwrite");
  await _requestToPromise(store.add(chunk));
  return chunk;
}

async function createChunksBatch(chunks) {
  const { tx, store } = _getStore(STORES.CHUNKS, "readwrite");
  const saved = [];

  for (const c of chunks) {
    const chunk = {
      id:         generateId(),
      documentId: c.documentId,
      notebookId: c.notebookId,
      text:       c.text,
      index:      c.index,
      embedding:  c.embedding ?? [],
      createdAt:  now(),
    };
    store.add(chunk);
    saved.push(chunk);
  }

  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });

  return saved;
}

async function getChunksByDocument(documentId) {
  const { store } = _getStore(STORES.CHUNKS);
  const index     = store.index("documentId");
  const chunks    = await _requestToPromise(index.getAll(documentId));
  return chunks.sort((a, b) => a.index - b.index);
}

async function getChunksByNotebook(notebookId) {
  const { store } = _getStore(STORES.CHUNKS);
  const index     = store.index("notebookId");
  return _requestToPromise(index.getAll(notebookId));
}

async function deleteChunksByDocument(documentId) {
  const chunks = await getChunksByDocument(documentId);
  const { tx, store } = _getStore(STORES.CHUNKS, "readwrite");
  for (const chunk of chunks) store.delete(chunk.id);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}

async function deleteChunksByNotebook(notebookId) {
  const chunks = await getChunksByNotebook(notebookId);
  const { tx, store } = _getStore(STORES.CHUNKS, "readwrite");
  for (const chunk of chunks) store.delete(chunk.id);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}

// --- Chats ---

async function createChatMessage(notebookId, role, content, sources = []) {
  const message = {
    id: generateId(),
    notebookId,
    role,
    content,
    sources,
    createdAt: now(),
  };
  const { store } = _getStore(STORES.CHATS, "readwrite");
  await _requestToPromise(store.add(message));
  return message;
}

async function getChatsByNotebook(notebookId) {
  const { store }  = _getStore(STORES.CHATS);
  const index      = store.index("notebookId");
  const messages   = await _requestToPromise(index.getAll(notebookId));
  return messages.sort((a, b) => a.createdAt - b.createdAt);
}

async function deleteChatsByNotebook(notebookId) {
  const messages = await getChatsByNotebook(notebookId);
  const { tx, store } = _getStore(STORES.CHATS, "readwrite");
  for (const msg of messages) store.delete(msg.id);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}

// --- Settings ---
// Default settings now pull from config.js so no manual setup is needed.

const DEFAULT_SETTINGS = {
  id:          "global",
  llmProvider: CONFIG.defaultProvider,
  apiKeys:     { ...CONFIG.apiKeys },
  modelName:   CONFIG.defaultModels[CONFIG.defaultProvider],
  theme:       "light",
};

async function getSettings() {
  const { store } = _getStore(STORES.SETTINGS);
  const stored    = await _requestToPromise(store.get("global"));

  if (stored) {
    // Always overlay config.js keys on top of stored settings.
    // This means updating config.js always takes effect immediately.
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      apiKeys: { ...CONFIG.apiKeys, ...stored.apiKeys },
    };
  }

  return { ...DEFAULT_SETTINGS, apiKeys: { ...CONFIG.apiKeys } };
}

async function saveSettings(changes) {
  const existing = await getSettings();
  const updated = {
    ...existing,
    ...changes,
    // Always keep config.js keys, but allow stored overrides on top
    apiKeys: { ...CONFIG.apiKeys, ...existing.apiKeys, ...(changes.apiKeys ?? {}) },
  };
  const { store } = _getStore(STORES.SETTINGS, "readwrite");
  await _requestToPromise(store.put(updated));
  return updated;
}

// --- Exports ---

export {
  openDB,
  STORES,
  createNotebook,
  getAllNotebooks,
  getNotebook,
  updateNotebook,
  deleteNotebook,
  createDocument,
  getDocumentsByNotebook,
  getDocument,
  deleteDocument,
  deleteDocumentsByNotebook,
  createChunk,
  createChunksBatch,
  getChunksByDocument,
  getChunksByNotebook,
  deleteChunksByDocument,
  deleteChunksByNotebook,
  createChatMessage,
  getChatsByNotebook,
  deleteChatsByNotebook,
  getSettings,
  saveSettings,
  generateId,
  now,
};