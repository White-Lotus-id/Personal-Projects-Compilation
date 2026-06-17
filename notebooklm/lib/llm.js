/**
 * llm.js - Offline LLM via WebLLM + WebGPU.
 *
 * Runs entirely in the browser. No server needed.
 * Model is downloaded once and cached by the browser.
 *
 * WebLLM v0.2+ API: use CreateMLCEngine(), not new MLCEngine().
 */

let _engine        = null;
let _loadedModelId = null;

/**
 * Returns the list of supported offline models.
 * @returns {Array<{ id: string, label: string }>}
 */
export function getAvailableModels() {
  return [
    { id: "Phi-3-mini-4k-instruct-q4f16_1-MLC",   label: "Phi-3 Mini 4K (recommended, ~2 GB)"   },
    { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",    label: "Llama 3.2 1B (very fast, ~700 MB)"    },
    { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",    label: "Llama 3.2 3B (balanced, ~1.8 GB)"     },
    { id: "Mistral-7B-Instruct-v0.3-q4f16_1-MLC", label: "Mistral 7B (high quality, ~4 GB)"      },
  ];
}

/**
 * Loads the WebLLM engine for the given model.
 * Reuses existing engine if the same model is already loaded.
 * @param {string} modelId
 * @param {function} [onProgress] - Called with progress strings during download
 * @returns {Promise<void>}
 */
export async function loadModel(modelId, onProgress = null) {
  if (typeof webllm === "undefined") {
    throw new Error("WebLLM not loaded. Add the CDN script tag to index.html.");
  }
  if (!navigator.gpu) {
    throw new Error("WebGPU not supported. Use Chrome/Edge with a GPU, or switch to online mode.");
  }
  if (_engine && _loadedModelId === modelId) return;

  _engine        = null;
  _loadedModelId = null;

  _engine = await webllm.CreateMLCEngine(modelId, {
    initProgressCallback: (progress) => {
      if (onProgress) onProgress(progress.text ?? "Loading model...");
    },
  });

  _loadedModelId = modelId;
}

/**
 * Generates a response by streaming tokens from the loaded model.
 * @param {Array<{ role: string, content: string }>} messages
 * @param {function} [onToken] - Called with each new token string
 * @returns {Promise<string>} Full response text
 */
export async function generateResponse(messages, onToken = null) {
  if (!_engine) {
    throw new Error("No model loaded. Call loadModel() first.");
  }

  let fullResponse = "";

  const stream = await _engine.chat.completions.create({
    messages,
    stream:      true,
    temperature: 0.3,
    max_tokens:  1024,
  });

  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content ?? "";
    if (token) {
      fullResponse += token;
      if (onToken) onToken(token);
    }
  }

  return fullResponse;
}

/** @returns {boolean} */
export function isModelLoaded() {
  return _engine !== null && _loadedModelId !== null;
}

/** @returns {string|null} */
export function getLoadedModelId() {
  return _loadedModelId;
}
