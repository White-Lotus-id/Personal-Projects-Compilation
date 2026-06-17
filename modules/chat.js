/**
 * chat.js - Chat session coordinator.
 *
 * Wires RAG + LLM together for one full message cycle:
 * save user msg → retrieve chunks → (optional) build prompt → call LLM → save reply → return result.
 *
 * NEW: Local mode (provider === "local")
 * When the user selects "Local" in Settings, NO LLM is used at all.
 * Instead, we retrieve relevant chunks via TF-IDF and return them formatted
 * directly as the "answer". This is pure document search — no AI generation.
 * Nothing is sent over the network, no model is loaded.
 */

import { createChatMessage, getChatsByNotebook, getSettings } from "../lib/db.js";
import { retrieveContext, buildPrompt }                        from "./rag.js";
import { generateResponse, isModelLoaded, loadModel }          from "../lib/llm.js";
import { sendMessage as sendOnlineMessage }                    from "../lib/api.js";

/**
 * Handles a full user message end-to-end.
 * @param {string} notebookId
 * @param {string} userText
 * @param {function} [onToken] - Called per token (offline streaming only)
 * @param {function} [onStatus] - Called with status strings for UI feedback
 * @returns {Promise<{ content: string, sources: string[] }>}
 */
export async function sendMessage(notebookId, userText, onToken = null, onStatus = null) {
  // 1. Save the user's message to the chat history
  await createChatMessage(notebookId, "user", userText, []);

  const settings = await getSettings();
  const isLocal  = settings.llmProvider === "local";

  // 2. Retrieve relevant document chunks using TF-IDF similarity
  if (onStatus) onStatus("Searching your documents...");

  const relevantChunks = await retrieveContext(notebookId, userText);
  const sourceIds      = relevantChunks.map(chunk => chunk.id);

  let fullReply;

  if (isLocal) {
    // ── LOCAL MODE ──
    // No LLM. Just format the retrieved chunks as the answer.
    fullReply = _buildLocalReply(relevantChunks);
  } else {
    // ── LLM MODE (online or offline WebLLM) ──
    // Build a prompt from chunks and send it to the active LLM
    const prompt = buildPrompt(userText, relevantChunks);

    const messages = [
      {
        role:    "system",
        content: "You are a helpful study assistant. Answer questions based on the provided source material. " +
                 "Be concise and accurate. If the source material does not contain the answer, say so.",
      },
      { role: "user", content: prompt },
    ];

    const isOffline = settings.llmProvider === "webllm";

    fullReply = isOffline
      ? await _sendOffline(messages, settings, onToken, onStatus)
      : await _sendOnline(messages, settings, onStatus);
  }

  // 3. Save the assistant's reply (or local search results) to chat history
  await createChatMessage(notebookId, "assistant", fullReply, sourceIds);

  return { content: fullReply, sources: sourceIds };
}

/**
 * Loads all messages for a notebook, oldest first.
 * @param {string} notebookId
 * @returns {Promise<Array>}
 */
export async function loadChatHistory(notebookId) {
  return getChatsByNotebook(notebookId);
}

// ============================================================
// Local mode — raw document retrieval, no LLM
// ============================================================

/**
 * Formats retrieved chunks into a readable response.
 * No AI is involved — this is purely formatting.
 *
 * @param {Array} chunks - Retrieved document chunks from RAG
 * @returns {string} Formatted search results
 */
function _buildLocalReply(chunks) {
  if (!chunks || chunks.length === 0) {
    return (
      "No matching passages found in your documents.\n\n" +
      "Try:\n" +
      "• Uploading a document first (PDF, TXT, or DOCX)\n" +
      "• Rephrasing your search with different keywords"
    );
  }

  const lines = chunks.map((chunk, i) => `[${i + 1}] ${chunk.text}`);

  return (
    `Found ${chunks.length} relevant passage${chunks.length === 1 ? "" : "s"} from your documents:\n\n` +
    lines.join("\n\n") +
    "\n\n---\n" +
    "Local Search mode: Results are ranked by relevance using TF-IDF cosine similarity. " +
    "No AI model was used to generate, summarize, or rephrase these excerpts."
  );
}

// ============================================================
// Offline (WebLLM)
// ============================================================

async function _sendOffline(messages, settings, onToken, onStatus) {
  if (!isModelLoaded()) {
    const modelId = settings.modelName || "Phi-3-mini-4k-instruct-q4f16_1-MLC";

    if (onStatus) {
      onStatus("Loading model for the first time. This may take a few minutes while the model downloads.");
    }

    await loadModel(modelId, onStatus);
  }

  if (onStatus) onStatus("Generating answer...");

  return generateResponse(messages, onToken);
}

// ============================================================
// Online (Gemini / Groq / OpenRouter)
// ============================================================

async function _sendOnline(messages, settings, onStatus) {
  if (onStatus) onStatus(`Sending to ${_providerLabel(settings.llmProvider)}...`);
  return sendOnlineMessage(messages, settings);
}

function _providerLabel(provider) {
  const labels = { gemini: "Gemini", groq: "Groq", openrouter: "OpenRouter" };
  return labels[provider] ?? provider;
}
