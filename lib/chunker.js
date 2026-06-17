/**
 * chunker.js - Splits text into overlapping chunks for RAG retrieval.
 *
 * Overlap prevents a sentence at a chunk boundary from being cut mid-thought.
 */

const CHUNK_SIZE    = 500;
const CHUNK_OVERLAP = 50;

/**
 * Splits raw text into chunks and attaches document metadata.
 * @param {string} text - Raw extracted text
 * @param {string} docId - Parent document ID
 * @returns {Array<{ docId, index, content, charCount, createdAt }>}
 */
export function chunkText(text, docId) {
  if (!text || text.trim().length === 0) return [];

  const cleaned   = _normalizeWhitespace(text);
  const rawChunks = _splitIntoChunks(cleaned);

  return rawChunks.map((content, index) => ({
    docId,
    index,
    content,
    charCount: content.length,
    createdAt: Date.now(),
  }));
}

function _normalizeWhitespace(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function _splitIntoChunks(text) {
  const chunks = [];
  const step   = CHUNK_SIZE - CHUNK_OVERLAP;
  let start    = 0;

  while (start < text.length) {
    const end   = start + CHUNK_SIZE;
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    if (end >= text.length) break;
    start += step;
  }

  return chunks;
}
