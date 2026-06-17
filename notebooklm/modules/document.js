/**
 * document.js - File upload and text extraction.
 *
 * Validates files, extracts text (PDF/TXT/DOCX), saves to IndexedDB, chunks text.
 */

import { chunkText }                         from "../lib/chunker.js";
import { createDocument, createChunksBatch } from "../lib/db.js";

const SUPPORTED_TYPES = {
  "application/pdf": _parsePDF,
  "text/plain":      _parseTXT,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": _parseDOCX,
};

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

/**
 * Full upload pipeline: validate → parse → save → chunk → save chunks.
 * @param {File} file
 * @param {string} notebookId
 * @returns {Promise<object>} Saved document record + chunkCount
 */
export async function handleFileUpload(file, notebookId) {
  _validateFile(file);

  const parser = SUPPORTED_TYPES[file.type];
  if (!parser) {
    throw new Error(`Unsupported file type: "${file.type}". Upload PDF, TXT, or DOCX.`);
  }

  const rawText = await parser(file);

  if (!rawText || rawText.trim().length === 0) {
    throw new Error("No text extracted. File may be image-only (scanned PDF) or empty.");
  }

  const fileType = _getFileTypeLabel(file.type);
  const savedDoc = await createDocument(notebookId, file.name, fileType, rawText);

  const chunks         = chunkText(rawText, savedDoc.id);
  const enrichedChunks = chunks.map(chunk => ({
    documentId: savedDoc.id,
    notebookId,
    text:       chunk.content,
    index:      chunk.index,
    embedding:  [],
  }));

  await createChunksBatch(enrichedChunks);

  return { ...savedDoc, chunkCount: chunks.length };
}

function _validateFile(file) {
  if (!file) throw new Error("No file provided.");
  if (file.size > MAX_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(`File is ${sizeMB} MB. Max allowed is 20 MB.`);
  }
}

function _getFileTypeLabel(mimeType) {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.includes("wordprocessingml")) return "docx";
  return "txt";
}

// --- Parsers ---

async function _parsePDF(file) {
  const pdfjsLib = await import(
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.min.mjs"
  );

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.worker.min.mjs";

  const arrayBuffer = await file.arrayBuffer();
  const pdf         = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageTexts   = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page    = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    pageTexts.push(content.items.map(item => item.str).join(" "));
  }

  return pageTexts.join("\n");
}

async function _parseTXT(file) {
  return file.text();
}

async function _parseDOCX(file) {
  if (typeof mammoth === "undefined") {
    throw new Error("Mammoth.js not loaded. Check the CDN script tag in index.html.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const result      = await mammoth.extractRawText({ arrayBuffer });

  if (result.messages?.length > 0) {
    console.warn("Mammoth.js warnings:", result.messages);
  }

  return result.value;
}
