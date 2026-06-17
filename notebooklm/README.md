# notebooklm-offline

Browser-based offline NotebookLM-style chat app with configurable Gemini / Groq / OpenRouter API support and local document search.

## Features

- Notebook-style chat interface
- Supports Google Gemini, Groq, and OpenRouter
- Local document ingestion and semantic search
- Configurable provider and model settings
- No backend required beyond browser + API access

## Getting Started

1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd notebooklm-offline
   ```
2. Open `index.html` in your browser.
3. Edit `config.js` with your own API keys.

> `config.js` is ignored by Git via `.gitignore`, so your local keys stay private.

## Configuration

Open `config.js` and replace the placeholder values with your API keys:

```js
export const CONFIG = {
  defaultProvider: "gemini",
  apiKeys: {
    gemini:     "YOUR_GEMINI_API_KEY_HERE",
    groq:       "YOUR_GROQ_API_KEY_HERE",
    openrouter: "YOUR_OPENROUTER_API_KEY_HERE",
  },
  defaultModels: {
    gemini:     "gemini-2.0-flash",
    groq:       "llama-3.3-70b-versatile",
    openrouter: "google/gemini-flash-1.5",
  },
};
```

## Usage

- Open the app in a browser.
- Select a provider and model in the app settings.
- Add documents and ask questions in the chat.
- Responses are generated using the selected API provider or local flow.

## Project Structure

- `index.html` — main application UI
- `app.js` — application bootstrap and initialization
- `config.js` — API configuration and provider settings
- `lib/` — API, model, database, and embedding utilities
- `modules/` — chat, document, notebook, and RAG behavior
- `ui/` — chat view, settings, and sidebar components

## Security

- Keep your API keys private.
- Do not commit real API keys to GitHub.
- `config.js` is excluded from version control by `.gitignore`.

## License

This project may be used freely, provided that you credit the original author when using or distributing it.

Example attribution:

> "Based on notebooklm-offline by the original author."