/**
 * settings.js - Settings modal: provider switcher only.
 *
 * The model picker has moved to the chat input bar (chatview.js).
 * API keys come from config.js automatically, no user input needed.
 *
 * NEW: "Local" provider option.
 * When selected, the app runs in pure local-search mode:
 *   - No LLM is loaded or called (neither WebLLM nor online APIs)
 *   - Document retrieval uses TF-IDF similarity only
 *   - AI features (Summary, Flashcards, Quiz) are disabled
 *   - No data leaves the device
 */

import { getSettings, saveSettings } from "../lib/db.js";

const PROVIDER_HINTS = {
  gemini:     "Google Gemini - 1,500 free requests/day. Fast and reliable.",
  groq:       "Groq - Extremely fast responses. Great for quick Q&A.",
  openrouter: "OpenRouter - Access to many different AI models.",
  // NEW: Local mode hint — explains what it does and what it cannot do
  local:      "Local mode — Pure document search, no AI. Retrieves relevant passages from your stored documents using TF-IDF. No data leaves your device. AI features (Summary, Flashcards, Quiz) are unavailable in this mode.",
};

/**
 * Opens the settings modal and highlights the current active provider.
 */
export async function showSettings() {
  const settings = await getSettings();
  _setActiveProviderTab(settings.llmProvider);
  _updateHint(settings.llmProvider);
  document.getElementById("settings-overlay").classList.remove("hidden");
}

/**
 * Closes the settings modal.
 */
export function hideSettings() {
  document.getElementById("settings-overlay").classList.add("hidden");
}

/**
 * Binds all settings modal event listeners.
 * Call once on app startup.
 */
export function bindSettingsEvents() {
  document.getElementById("btn-close-settings").addEventListener("click", hideSettings);

  // Close when clicking the dark backdrop
  document.getElementById("settings-overlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) hideSettings();
  });

  // Switching provider tab updates the hint text only
  document.getElementById("mode-tabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".mode-tab");
    if (!tab) return;
    _setActiveProviderTab(tab.dataset.provider);
    _updateHint(tab.dataset.provider);
  });

  document.getElementById("btn-save-settings").addEventListener("click", _handleSave);
}

// --- Private helpers ---

function _setActiveProviderTab(provider) {
  document.querySelectorAll(".mode-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.provider === provider);
  });
}

function _updateHint(provider) {
  const hint = document.getElementById("settings-provider-hint");
  if (hint) hint.textContent = PROVIDER_HINTS[provider] ?? "";
}

/**
 * Saves the selected provider to IndexedDB.
 * Then tells chatview to refresh the model dropdown for the new provider
 * and updates the UI for the current mode (disables features in Local mode).
 */
async function _handleSave() {
  const activeTab = document.querySelector(".mode-tab.active");
  if (!activeTab) return;

  const provider = activeTab.dataset.provider;
  await saveSettings({ llmProvider: provider });

  hideSettings();
  _flashSaveConfirmation();

  // Notify chatview to repopulate the inline model dropdown
  // and to enable/disable feature buttons based on the new mode.
  // We dispatch a custom event so chatview.js can listen without a direct import.
  window.dispatchEvent(new CustomEvent("provider-changed", { detail: { provider } }));
}

function _flashSaveConfirmation() {
  const btn      = document.getElementById("btn-save-settings");
  const original = btn.textContent;
  btn.textContent = "Saved ✓";
  btn.disabled    = true;
  setTimeout(() => {
    btn.textContent = original;
    btn.disabled    = false;
  }, 1500);
}
