/**
 * embedder.js - TF-IDF cosine similarity for in-browser semantic search.
 *
 * No external model needed. Fast, offline, good enough for personal note retrieval.
 */

const STOPWORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with","by",
  "from","is","was","are","were","be","been","being","have","has","had","do",
  "does","did","will","would","could","should","may","might","shall","can",
  "that","this","these","those","i","you","he","she","it","we","they","me",
  "him","her","us","them","my","your","his","its","our","their","what","which",
  "who","whom","when","where","why","how","all","each","both","few","more",
  "most","other","some","such","not","only","own","so","than","too","very",
  "just","as","if","then","about","into","through","during","before","after",
  "above","below","between","out","off","over","under","again","no","nor",
  "s","t","don","also","any","there","here","up","down",
]);

// --- Text preprocessing ---

function _tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t));
}

function _termFrequencyMap(tokens) {
  const map = {};
  for (const token of tokens) {
    map[token] = (map[token] || 0) + 1;
  }
  return map;
}

// --- Corpus state ---

let _corpus   = [];
let _idfCache = null;

/**
 * Builds TF-IDF corpus from all chunk texts.
 * Must be called before embedText() so IDF scores are calculated.
 * @param {string[]} texts
 */
export function buildCorpus(texts) {
  _corpus   = texts.map(t => _termFrequencyMap(_tokenize(t)));
  _idfCache = null;
}

function _computeIDF() {
  if (_idfCache) return _idfCache;

  const N          = _corpus.length;
  const docFreq    = {};

  for (const tfMap of _corpus) {
    for (const word of Object.keys(tfMap)) {
      docFreq[word] = (docFreq[word] || 0) + 1;
    }
  }

  const idf = {};
  for (const [word, df] of Object.entries(docFreq)) {
    idf[word] = Math.log(N / (1 + df));
  }

  _idfCache = idf;
  return idf;
}

// --- Embedding ---

/**
 * Converts text to a sparse TF-IDF vector.
 * Words not in corpus get IDF = 0 and are ignored in similarity scoring.
 * @param {string} text
 * @returns {Object.<string, number>}
 */
export function embedText(text) {
  const tokens      = _tokenize(text);
  const tfMap       = _termFrequencyMap(tokens);
  const idf         = _computeIDF();
  const totalTokens = tokens.length || 1;
  const vector      = {};

  for (const [word, count] of Object.entries(tfMap)) {
    const tf       = count / totalTokens;
    const idfScore = idf[word] ?? 0;
    vector[word]   = tf * idfScore;
  }

  return vector;
}

/**
 * Embeds an array of texts in one pass.
 * @param {string[]} texts
 * @returns {Array<Object.<string, number>>}
 */
export function embedBatch(texts) {
  return texts.map(t => embedText(t));
}

// --- Similarity ---

/**
 * Cosine similarity between two sparse TF-IDF vectors.
 * Returns 0.0-1.0 (higher = more similar).
 * @param {Object.<string, number>} vecA
 * @param {Object.<string, number>} vecB
 * @returns {number}
 */
export function cosineSimilarity(vecA, vecB) {
  let dot  = 0;
  let magA = 0;
  let magB = 0;

  for (const [word, scoreA] of Object.entries(vecA)) {
    if (vecB[word] !== undefined) dot += scoreA * vecB[word];
    magA += scoreA * scoreA;
  }

  for (const scoreB of Object.values(vecB)) {
    magB += scoreB * scoreB;
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}
