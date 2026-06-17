/**
 * features.js - AI-powered study tools: Summary, Flashcards, Quiz.
 *
 * All three functions use the same pipeline:
 * load chunks → build context → call LLM → parse + return structured result.
 *
 * NEW: Local mode guard
 * When the provider is "local" (pure document search, no AI), these features
 * cannot work because they require an LLM to generate content. We throw a
 * clear error that chatview.js catches and displays to the user.
 */

import { getChunksByNotebook, getSettings }           from "../lib/db.js";
import { sendMessage as sendOnlineMessage }            from "../lib/api.js";
import { generateResponse, isModelLoaded, loadModel }  from "../lib/llm.js";

// Cap context to avoid overflowing the LLM context window (~8K chars ~ 2K tokens)
const MAX_CONTEXT_CHARS = 8000;

// --- Public API ---

/**
 * Generates a structured summary of all documents in a notebook.
 * @param {string} notebookId
 * @returns {Promise<string>} Formatted markdown-style summary text
 */
export async function generateSummary(notebookId) {
  const context = await _buildContext(notebookId);

  const messages = [
    {
      role:    "system",
      content: "You are a precise study assistant. Always follow the requested output format exactly.",
    },
    {
      role:    "user",
      content:
        "Read the following source material and produce a structured summary.\n\n" +
        "Format your response exactly like this:\n" +
        "## Overview\n<one paragraph overview>\n\n" +
        "## Key Topics\n- <topic 1>\n- <topic 2>\n...\n\n" +
        "## Important Facts\n- <fact 1>\n- <fact 2>\n...\n\n" +
        "Source material:\n---\n" + context + "\n---\n\nNow write the summary:",
    },
  ];

  return _callLLM(messages);
}

/**
 * Generates 8-10 study flashcards from notebook documents.
 * @param {string} notebookId
 * @returns {Promise<Array<{ question: string, answer: string }>>}
 */
export async function generateFlashcards(notebookId) {
  const context = await _buildContext(notebookId);

  const messages = [
    {
      role:    "system",
      content: "You are a study assistant. Respond ONLY with valid JSON. No prose, no markdown fences.",
    },
    {
      role:    "user",
      content:
        "Read the following source material and create 8-10 study flashcards covering key facts.\n\n" +
        "Respond with ONLY a JSON array. Each item must have exactly: \"question\" and \"answer\".\n\n" +
        'Example: [{"question":"What is X?","answer":"X is Y."}]\n\n' +
        "Source material:\n---\n" + context + "\n---\n\nJSON flashcards:",
    },
  ];

  const raw = await _callLLM(messages);

  return _parseJSONResponse(raw, "flashcards", [
    { question: "Failed to parse flashcards.", answer: "Please try again." },
  ]);
}

/**
 * Generates a 5-question multiple-choice quiz from notebook documents.
 * @param {string} notebookId
 * @returns {Promise<Array<{ question: string, options: string[], correctAnswer: string }>>}
 */
export async function generateQuiz(notebookId) {
  const context = await _buildContext(notebookId);

  const messages = [
    {
      role:    "system",
      content: "You are a study assistant. Respond ONLY with valid JSON. No prose, no markdown fences.",
    },
    {
      role:    "user",
      content:
        "Read the following source material and create 5 multiple-choice quiz questions.\n\n" +
        "Respond with ONLY a JSON array. Each item must have:\n" +
        "  \"question\" - the question text\n" +
        "  \"options\" - array of exactly 4 answer strings\n" +
        "  \"correctAnswer\" - one of the 4 options, copied exactly\n\n" +
        'Example: [{"question":"What is X?","options":["A","B","C","D"],"correctAnswer":"A"}]\n\n' +
        "Source material:\n---\n" + context + "\n---\n\nJSON quiz:",
    },
  ];

  const raw = await _callLLM(messages);

  return _parseJSONResponse(raw, "quiz", [
    { question: "Failed to parse quiz.", options: ["Please try again.", "", "", ""], correctAnswer: "Please try again." },
  ]);
}

// --- Private helpers ---

/**
 * Loads and concatenates chunk text up to MAX_CONTEXT_CHARS.
 * @param {string} notebookId
 * @returns {Promise<string>}
 */
async function _buildContext(notebookId) {
  const chunks = await getChunksByNotebook(notebookId);

  if (!chunks || chunks.length === 0) {
    throw new Error("No documents found. Upload at least one document before using study features.");
  }

  chunks.sort((a, b) => a.index - b.index);

  let context = "";
  for (const chunk of chunks) {
    if (context.length + chunk.text.length > MAX_CONTEXT_CHARS) break;
    context += chunk.text + "\n\n";
  }

  return context.trim();
}

/**
 * Routes to offline or online LLM based on current settings.
 *
 * NEW: Explicitly rejects "local" provider because AI features require
 * an LLM to generate content. Local mode = search only, no generation.
 *
 * @param {Array<{ role: string, content: string }>} messages
 * @returns {Promise<string>}
 */
async function _callLLM(messages) {
  const settings = await getSettings();

  // Local mode cannot generate AI content — reject early with a clear message.
  if (settings.llmProvider === "local") {
    throw new Error(
      "AI features (Summary, Flashcards, Quiz) require an LLM provider. " +
      "Switch to Gemini, Groq, OpenRouter, or WebLLM in Settings."
    );
  }

  const isOffline = settings.llmProvider === "webllm";

  if (isOffline) {
    if (!isModelLoaded()) {
      const modelId = settings.modelName || "Phi-3-mini-4k-instruct-q4f16_1-MLC";
      await loadModel(modelId);
    }
    // No streaming for features: we need the complete JSON at once
    return generateResponse(messages, null);
  }

  return sendOnlineMessage(messages, settings);
}

/**
 * Parses a JSON array from raw LLM output.
 * Strips markdown fences and preamble text before parsing.
 * Returns fallback if parsing fails.
 * @param {string} rawText
 * @param {string} label - Used in error logs
 * @param {*} fallback
 * @returns {Array}
 */
function _parseJSONResponse(rawText, label, fallback) {
  try {
    const cleaned    = rawText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const arrayStart = cleaned.indexOf("[");
    const arrayEnd   = cleaned.lastIndexOf("]");

    if (arrayStart === -1 || arrayEnd === -1) {
      throw new Error("No JSON array found in response.");
    }

    const parsed = JSON.parse(cleaned.slice(arrayStart, arrayEnd + 1));

    if (!Array.isArray(parsed)) throw new Error("Parsed value is not an array.");

    return parsed;
  } catch (err) {
    console.error(`features.js: Failed to parse ${label}.`, err, "\nRaw:\n", rawText);
    return fallback;
  }
}
