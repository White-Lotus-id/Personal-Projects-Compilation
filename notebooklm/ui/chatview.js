/**
 * chatview.js - Main chat area UI.
 *
 * Renders:
 * - Uploaded document chips (top)
 * - Chat message history (middle)
 * - Feature result cards (summary, flashcards, quiz)
 * - Message input bar with inline model picker (bottom)
 *
 * All data operations delegate to chat.js, document.js, and features.js.
 *
 * NEW: Local mode awareness.
 * When the active provider is "local":
 *   - The model picker shows "Local Search" (read-only)
 *   - AI feature buttons (Summary, Flashcards, Quiz) are disabled
 *   - The textarea placeholder changes to "Search your documents..."
 *   - We show a friendly message if the user clicks a disabled feature button
 */

import { sendMessage, loadChatHistory }                          from "../modules/chat.js";
import { handleFileUpload }                                      from "../modules/document.js";
import { generateSummary, generateFlashcards, generateQuiz }     from "../modules/features.js";
import { getDocumentsByNotebook, deleteDocument, getSettings, saveSettings } from "../lib/db.js";
import { getModelsForProvider }                                  from "../lib/api.js";

/** Active notebook ID, set by openNotebook() */
let _activeNotebookId = null;

/** The streaming assistant bubble element */
let _streamingBubble = null;

/** Whether a request is currently in flight */
let _isBusy = false;

// ============================================================
// Public API
// ============================================================

/**
 * Opens a notebook in the chat panel.
 * Loads document list, chat history, populates the model picker,
 * and updates the UI based on the current provider mode (Local vs LLM).
 * @param {string} notebookId
 * @param {string} notebookTitle
 */
export async function openNotebook(notebookId, notebookTitle) {
  _activeNotebookId = notebookId;

  document.getElementById("empty-state").classList.add("hidden");
  document.getElementById("chat-panel").classList.remove("hidden");
  document.getElementById("notebook-title").textContent = notebookTitle;

  _clearMessages();

  await renderDocumentList(notebookId);
  await _renderChatHistory(notebookId);

  // Populate the inline model picker based on the current provider
  await _refreshModelPicker();

  // NEW: Adjust the UI (feature buttons, placeholder) for Local vs LLM mode
  await _updateUIForCurrentMode();

  document.getElementById("chat-input").focus();
}

/**
 * Renders the source document chips at the top of the chat panel.
 * @param {string} notebookId
 */
export async function renderDocumentList(notebookId) {
  const docs = await getDocumentsByNotebook(notebookId);
  const list = document.getElementById("document-list");

  list.innerHTML = "";

  if (docs.length === 0) {
    list.innerHTML = `<li style="font-size:13px;color:var(--ink-3);">No sources yet.</li>`;
    return;
  }

  for (const doc of docs) {
    list.appendChild(_createDocumentChip(doc));
  }
}

/**
 * Binds all chat view event listeners.
 * Call once on app startup.
 */
export function bindChatEvents() {
  document.getElementById("btn-send").addEventListener("click", _handleSend);

  // Enter to send, Shift+Enter for new line
  document.getElementById("chat-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      _handleSend();
    }
  });

  document.getElementById("chat-input").addEventListener("input", _autoResizeTextarea);
  document.getElementById("file-input").addEventListener("change", _handleFileUpload);

  document.getElementById("btn-feature-summary").addEventListener("click",
    () => _handleFeature("summary"));
  document.getElementById("btn-feature-flashcards").addEventListener("click",
    () => _handleFeature("flashcards"));
  document.getElementById("btn-feature-quiz").addEventListener("click",
    () => _handleFeature("quiz"));

  // When the user picks a different model in the inline dropdown, save it immediately
  document.getElementById("select-model-inline").addEventListener("change", async (e) => {
    await saveSettings({ modelName: e.target.value });
  });

  // When provider changes from settings modal, refresh the model dropdown
  // AND update the feature button states / placeholder text.
  window.addEventListener("provider-changed", async () => {
    await _refreshModelPicker();
    await _updateUIForCurrentMode();
  });
}

// ============================================================
// NEW: Local mode UI updates
// ============================================================

/**
 * Adjusts the chat UI based on the current provider.
 * In Local mode:
 *   - Disables AI feature buttons (Summary, Flashcards, Quiz)
 *   - Changes the textarea placeholder to indicate search mode
 * In LLM mode:
 *   - Enables all feature buttons
 *   - Restores the default placeholder
 */
async function _updateUIForCurrentMode() {
  const settings = await getSettings();
  const isLocal  = settings.llmProvider === "local";

  // Enable/disable AI feature buttons
  document.querySelectorAll(".btn-feature").forEach(btn => {
    btn.disabled = isLocal;
  });

  // Update the textarea placeholder to match the mode
  const input = document.getElementById("chat-input");
  input.placeholder = isLocal
    ? "Search your documents... (Local mode — no AI)"
    : "Ask a question about your documents...";
}

// ============================================================
// Private: inline model picker
// ============================================================

/**
 * Reads the current provider from settings and fills the model dropdown
 * with the correct models. Keeps the previously selected model if it
 * still exists in the new list, otherwise resets to the first option.
 */
async function _refreshModelPicker() {
  const settings = await getSettings();
  const provider = settings.llmProvider;
  const models   = getModelsForProvider(provider);
  const select   = document.getElementById("select-model-inline");

  select.innerHTML = models
    .map(m => `<option value="${m.id}" ${m.id === settings.modelName ? "selected" : ""}>${m.label}</option>`)
    .join("");

  // If the stored model is not in the new provider's list, save the first one
  const validIds = models.map(m => m.id);
  if (!validIds.includes(settings.modelName) && models.length > 0) {
    await saveSettings({ modelName: models[0].id });
    select.value = models[0].id;
  }
}

// ============================================================
// Private: chat history
// ============================================================

async function _renderChatHistory(notebookId) {
  const messages = await loadChatHistory(notebookId);

  if (messages.length === 0) {
    document.getElementById("chat-empty").classList.remove("hidden");
    return;
  }

  document.getElementById("chat-empty").classList.add("hidden");

  for (const msg of messages) {
    _appendMessage(msg.role, msg.content, msg.sources ?? []);
  }

  _scrollToBottom();
}

// ============================================================
// Private: message sending
// ============================================================

async function _handleSend() {
  if (_isBusy || !_activeNotebookId) return;

  const input = document.getElementById("chat-input");
  const text  = input.value.trim();
  if (!text) return;

  // Save the currently selected model before sending, in case user just changed it
  const selectedModel = document.getElementById("select-model-inline").value;
  if (selectedModel) await saveSettings({ modelName: selectedModel });

  input.value = "";
  _autoResizeTextarea.call(input);

  document.getElementById("chat-empty").classList.add("hidden");
  _appendMessage("user", text, []);
  _scrollToBottom();

  _setBusy(true);
  _streamingBubble = _startStreamingBubble();
  _scrollToBottom();

  try {
    const result = await sendMessage(
      _activeNotebookId,
      text,
      (token)  => _appendToken(token),
      (status) => _setStatus(status),
    );

    _finaliseStreamingBubble(result.content, result.sources);

  } catch (err) {
    _finaliseStreamingBubble(`Error: ${err.message}`, []);
  } finally {
    _setBusy(false);
    _setStatus(null);
    _scrollToBottom();
  }
}

// ============================================================
// Private: streaming bubble
// ============================================================

function _startStreamingBubble() {
  const container = document.getElementById("chat-messages");
  const wrapper   = document.createElement("div");
  wrapper.className = "message assistant";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.innerHTML = `<span class="streaming-cursor"></span>`;

  wrapper.appendChild(bubble);
  container.appendChild(wrapper);
  return { wrapper, bubble };
}

function _appendToken(token) {
  if (!_streamingBubble) return;
  const cursor = _streamingBubble.bubble.querySelector(".streaming-cursor");
  _streamingBubble.bubble.insertBefore(document.createTextNode(token), cursor);
  _scrollToBottom();
}

function _finaliseStreamingBubble(content, sources) {
  if (!_streamingBubble) return;

  const { wrapper, bubble } = _streamingBubble;
  _streamingBubble = null;

  bubble.textContent = content;

  if (sources && sources.length > 0) {
    const sourcesEl = document.createElement("div");
    sourcesEl.className = "message-sources";
    sources.slice(0, 5).forEach((_, i) => {
      const chip = document.createElement("span");
      chip.className   = "source-chip";
      chip.textContent = `Source ${i + 1}`;
      sourcesEl.appendChild(chip);
    });
    wrapper.appendChild(sourcesEl);
  }
}

// ============================================================
// Private: message rendering
// ============================================================

function _appendMessage(role, content, sources = []) {
  const container = document.getElementById("chat-messages");

  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;

  const bubble = document.createElement("div");
  bubble.className   = "message-bubble";
  bubble.textContent = content;
  wrapper.appendChild(bubble);

  if (role === "assistant" && sources && sources.length > 0) {
    const sourcesEl = document.createElement("div");
    sourcesEl.className = "message-sources";
    sources.slice(0, 5).forEach((_, i) => {
      const chip = document.createElement("span");
      chip.className   = "source-chip";
      chip.textContent = `Source ${i + 1}`;
      sourcesEl.appendChild(chip);
    });
    wrapper.appendChild(sourcesEl);
  }

  container.appendChild(wrapper);
}

// ============================================================
// Private: file upload
// ============================================================

async function _handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file || !_activeNotebookId) return;

  e.target.value = "";
  _showUploadStatus("Uploading and processing...");

  try {
    const result = await handleFileUpload(file, _activeNotebookId);
    _showUploadStatus(`Added: ${result.filename} (${result.chunkCount} chunks)`);
    await renderDocumentList(_activeNotebookId);
    setTimeout(() => _hideUploadStatus(), 3000);
  } catch (err) {
    _showUploadStatus(`Error: ${err.message}`, true);
  }
}

function _createDocumentChip(doc) {
  const li = document.createElement("li");
  li.className = "document-chip";
  li.innerHTML = `
    <span class="document-chip-type">${doc.type}</span>
    <span>${_escapeHtml(doc.filename)}</span>
    <span class="document-chip-delete" title="Remove source">✕</span>
  `;

  li.querySelector(".document-chip-delete").addEventListener("click", async () => {
    if (!confirm(`Remove "${doc.filename}"?`)) return;
    await deleteDocument(doc.id);
    await renderDocumentList(_activeNotebookId);
  });

  return li;
}

function _showUploadStatus(msg, isError = false) {
  const el = document.getElementById("upload-status");
  el.textContent = msg;
  el.classList.remove("hidden", "error");
  if (isError) el.classList.add("error");
}

function _hideUploadStatus() {
  document.getElementById("upload-status").classList.add("hidden");
}

// ============================================================
// Private: study features
// ============================================================

async function _handleFeature(type) {
  if (_isBusy || !_activeNotebookId) return;

  // NEW: Check if we're in Local mode and show a friendly explanation.
  // The buttons are already disabled visually, but this handles edge cases
  // and provides helpful feedback if triggered programmatically.
  const settings = await getSettings();
  if (settings.llmProvider === "local") {
    _setStatus("AI features require an LLM provider. Switch to Gemini, Groq, OpenRouter, or WebLLM in Settings.");
    setTimeout(() => _setStatus(null), 5000);
    return;
  }

  _setBusy(true);
  _setStatus(`Generating ${type}...`);
  document.getElementById("chat-empty").classList.add("hidden");

  try {
    if (type === "summary") {
      _appendSummaryCard(await generateSummary(_activeNotebookId));
    } else if (type === "flashcards") {
      _appendFlashcardsCard(await generateFlashcards(_activeNotebookId));
    } else if (type === "quiz") {
      _appendQuizCard(await generateQuiz(_activeNotebookId));
    }
  } catch (err) {
    _appendMessage("assistant", `Error generating ${type}: ${err.message}`, []);
  } finally {
    _setBusy(false);
    _setStatus(null);
    _scrollToBottom();
  }
}

function _appendSummaryCard(text) {
  const card = document.createElement("div");
  card.className = "feature-card";
  card.innerHTML = `<h3>Summary</h3><div class="summary-text">${_markdownToHtml(text)}</div>`;
  document.getElementById("chat-messages").appendChild(card);
}

function _appendFlashcardsCard(cards) {
  const card = document.createElement("div");
  card.className = "feature-card";

  const grid = cards.map((fc, i) => `
    <div class="flashcard" data-index="${i}">
      <div class="flashcard-front">${_escapeHtml(fc.question)}</div>
      <div class="flashcard-back">${_escapeHtml(fc.answer)}</div>
    </div>
  `).join("");

  card.innerHTML = `<h3>Flashcards <span style="font-weight:400;color:var(--ink-3);font-size:13px;">Click to reveal</span></h3><div class="flashcard-grid">${grid}</div>`;
  card.querySelectorAll(".flashcard").forEach(fc => {
    fc.addEventListener("click", () => fc.classList.toggle("flipped"));
  });

  document.getElementById("chat-messages").appendChild(card);
}

function _appendQuizCard(questions) {
  const card = document.createElement("div");
  card.className = "feature-card";

  const questionsHtml = questions.map((q, qi) => `
    <div class="quiz-question">
      <p>${qi + 1}. ${_escapeHtml(q.question)}</p>
      <div class="quiz-options">
        ${q.options.map(opt => `
          <button class="quiz-option" data-correct="${opt === q.correctAnswer}" data-qi="${qi}">
            ${_escapeHtml(opt)}
          </button>
        `).join("")}
      </div>
    </div>
  `).join("");

  card.innerHTML = `<h3>Quiz</h3>${questionsHtml}`;

  card.querySelectorAll(".quiz-option").forEach(btn => {
    btn.addEventListener("click", () => {
      const qi = btn.dataset.qi;
      card.querySelectorAll(`.quiz-option[data-qi="${qi}"]`).forEach(b => {
        b.disabled = true;
        if (b.dataset.correct === "true") b.classList.add("correct");
      });
      if (btn.dataset.correct !== "true") btn.classList.add("wrong");
    });
  });

  document.getElementById("chat-messages").appendChild(card);
}

// ============================================================
// Private: UI helpers
// ============================================================

function _clearMessages() {
  document.getElementById("chat-messages").innerHTML =
    `<div id="chat-empty" class="chat-empty"><p>Ask anything about your sources.</p></div>`;
}

function _scrollToBottom() {
  const container = document.getElementById("chat-messages");
  container.scrollTop = container.scrollHeight;
}

function _setBusy(busy) {
  _isBusy = busy;
  document.getElementById("btn-send").disabled   = busy;
  document.getElementById("chat-input").disabled = busy;
  document.getElementById("select-model-inline").disabled = busy;
  document.querySelectorAll(".btn-feature").forEach(b => b.disabled = busy);
}

function _setStatus(msg) {
  const el = document.getElementById("status-indicator");
  if (msg) {
    el.textContent = msg;
    el.classList.remove("hidden");
  } else {
    el.classList.add("hidden");
  }
}

function _autoResizeTextarea() {
  this.style.height = "auto";
  this.style.height = `${Math.min(this.scrollHeight, 140)}px`;
}

function _escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function _markdownToHtml(text) {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^## (.+)$/gm, "<h4>$1</h4>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>(\n|$))+/g, "<ul>$&</ul>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/^(?!<[hul])(.+)$/gm, "<p>$1</p>")
    .replace(/<p><\/p>/g, "");
}
