/**
 * api.js - Online LLM API clients: Gemini, Groq, OpenRouter.
 *
 * API keys are loaded from config.js automatically.
 * No user input or settings key entry is needed.
 *
 * Gemini:     URL includes model + API key. Uses "contents/parts" body format.
 *             No "system" role - system text is merged into the first user message.
 *             Response: data.candidates[0].content.parts[0].text
 *
 * Groq:       OpenAI-compatible. Bearer token in Authorization header.
 *             Response: data.choices[0].message.content
 *
 * OpenRouter: OpenAI-compatible. Requires HTTP-Referer + X-Title headers.
 *             Response: data.choices[0].message.content
 *
 * Local:      Not handled here — chat.js routes around this module entirely
 *             when the provider is "local". No API key, no HTTP request.
 */

import { CONFIG } from "../config.js";

/**
 * Routes a chat message to the active online provider.
 * Reads the API key for the active provider from config.js.
 * @param {Array<{ role: string, content: string }>} messages
 * @param {object} settings - From db.getSettings()
 * @returns {Promise<string>}
 */
export async function sendMessage(messages, settings) {
  const provider = settings.llmProvider;
  const model    = settings.modelName;

  // Local mode never calls this function — chat.js handles it separately.
  if (provider === "local") {
    throw new Error(
      "Local provider does not use online APIs. " +
      "This is a bug — chat.js should have routed around api.js for local mode."
    );
  }

  // Always pull keys from config.js, not from stored settings
  const apiKey = CONFIG.apiKeys[provider];

  switch (provider) {
    case "gemini":     return _callGemini(messages, apiKey, model);
    case "groq":       return _callGroq(messages, apiKey, model);
    case "openrouter": return _callOpenRouter(messages, apiKey, model);
    default:
      throw new Error(`Unknown provider: "${provider}". Expected gemini, groq, openrouter, or local.`);
  }
}

// --- Gemini ---

async function _callGemini(messages, apiKey, model) {
  if (!apiKey) throw new Error("Gemini API key not found in config.js.");

  const modelName = model || CONFIG.defaultModels.gemini;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: _toGeminiContents(messages),
      generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
    }),
  });

  const data = await _parseResponse(response, "Gemini");
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}

/**
 * Converts standard messages to Gemini's contents format.
 * Merges "system" role text into the first user message because
 * Gemini does not support a system role directly.
 */
function _toGeminiContents(messages) {
  const contents    = [];
  let pendingSystem = "";

  for (const msg of messages) {
    if (msg.role === "system") {
      pendingSystem += msg.content + "\n\n";
      continue;
    }

    const role = msg.role === "assistant" ? "model" : "user";
    const text = (role === "user" && pendingSystem)
      ? pendingSystem + msg.content
      : msg.content;

    if (role === "user") pendingSystem = "";

    contents.push({ role, parts: [{ text }] });
  }

  return contents;
}

// --- Groq ---

async function _callGroq(messages, apiKey, model) {
  if (!apiKey) throw new Error("Groq API key not found in config.js.");

  const modelName = model || CONFIG.defaultModels.groq;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: modelName, messages, temperature: 0.3, max_tokens: 1024 }),
  });

  const data = await _parseResponse(response, "Groq");
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq returned an empty response.");
  return text;
}

// --- OpenRouter ---

async function _callOpenRouter(messages, apiKey, model) {
  if (!apiKey) throw new Error("OpenRouter API key not found in config.js.");

  const modelName = model || CONFIG.defaultModels.openrouter;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer":  "http://localhost",
      "X-Title":       "NotepadLM",
    },
    body: JSON.stringify({ model: modelName, messages, temperature: 0.3, max_tokens: 1024 }),
  });

  const data = await _parseResponse(response, "OpenRouter");
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenRouter returned an empty response.");
  return text;
}

// --- Shared ---

async function _parseResponse(response, providerName) {
  const data = await response.json();

  if (!response.ok) {
    const apiError =
      data?.error?.message ||
      data?.error?.status  ||
      JSON.stringify(data?.error) ||
      "Unknown error";
    throw new Error(`${providerName} API error (${response.status}): ${apiError}`);
  }

  return data;
}

/**
 * Returns the list of models available for a given provider.
 * Used to populate the inline model picker in the chat bar.
 *
 * For the "local" provider we return a single entry so the dropdown
 * shows "Local Search" — this makes it obvious to the user that no
 * external model is being used.
 *
 * @param {string} provider
 * @returns {Array<{ id: string, label: string }>}
 */
export function getModelsForProvider(provider) {
  const models = {
    gemini: [
      { id: "gemini-2.0-flash",      label: "Gemini 2.0 Flash" },
      { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite" },
      { id: "gemini-1.5-pro",        label: "Gemini 1.5 Pro" },
    ],
    groq: [
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
      { id: "llama-3.1-8b-instant",    label: "Llama 3.1 8B" },
      { id: "mixtral-8x7b-32768",      label: "Mixtral 8x7B" },
    ],
    openrouter: [
      { id: "google/gemini-flash-1.5",           label: "Gemini Flash 1.5" },
      { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
      { id: "mistralai/mistral-7b-instruct",     label: "Mistral 7B" },
      { id: "anthropic/claude-3-haiku",          label: "Claude 3 Haiku" },
    ],
    // Local mode has no external model. We show a single disabled option
    // so the dropdown still displays something meaningful.
    local: [
      { id: "local-search", label: "Local Search" },
    ],
  };

  return models[provider] ?? [];
}
