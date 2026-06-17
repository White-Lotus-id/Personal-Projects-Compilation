/**
 * rag.js - Retrieval-Augmented Generation logic.
 *
 * Given a user question, finds the TOP_K most relevant chunks
 * using TF-IDF cosine similarity, then formats them into a prompt.
 */

import { getChunksByNotebook }                       from "../lib/db.js";
import { buildCorpus, embedText, cosineSimilarity }  from "../lib/embedder.js";

const TOP_K = 5;

/**
 * Finds the top K most relevant chunks for a query.
 * @param {string} notebookId
 * @param {string} query
 * @returns {Promise<Array>} Chunks with added `score` field, highest first
 */
export async function retrieveContext(notebookId, query) {
  const chunks = await getChunksByNotebook(notebookId);

  if (!chunks || chunks.length === 0) return [];

  const chunkTexts  = chunks.map(c => c.text);
  buildCorpus(chunkTexts);

  const queryVector  = embedText(query);

  const scored = chunks.map(chunk => ({
    ...chunk,
    score: cosineSimilarity(queryVector, embedText(chunk.text)),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, TOP_K);
}

/**
 * Builds the LLM prompt from retrieved chunks and the user question.
 * @param {string} query
 * @param {Array} chunks
 * @returns {string}
 */
export function buildPrompt(query, chunks) {
  if (!chunks || chunks.length === 0) {
    return (
      "No source documents available for this notebook.\n\n" +
      `Question: ${query}\n\n` +
      "Answer from general knowledge and tell the user no documents have been uploaded."
    );
  }

  const sourceLines = chunks
    .map((chunk, i) => `[Source ${i + 1}]\n${chunk.text}`)
    .join("\n\n");

  return (
    "Use the following source material to answer the question.\n" +
    "Cite source numbers (e.g. [Source 1]) in your answer.\n\n" +
    sourceLines +
    `\n\nQuestion: ${query}`
  );
}
