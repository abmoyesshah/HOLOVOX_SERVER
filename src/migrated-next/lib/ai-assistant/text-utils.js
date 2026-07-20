const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "than", "to", "for", "of", "on", "in", "at", "by", "with", "from", "as", "is", "are", "was", "were", "be", "been", "being", "it", "this", "that", "these", "those", "you", "your", "yours", "we", "our", "ours", "they", "their", "them", "he", "she", "his", "her", "him", "i", "me", "my", "mine", "do", "does", "did", "not", "no", "yes", "can", "could", "should", "would", "will", "just", "about", "into", "over", "under", "after", "before", "during", "up", "down", "out", "off", "so", "very", "also",
]);

export function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001F]/g, "")
    .trim();
}

export function tokenize(value) {
  return normalizeText(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

export function chunkText(text, maxChars = 850, overlap = 140) {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const chunks = [];
  let cursor = 0;

  while (cursor < normalized.length) {
    const end = Math.min(normalized.length, cursor + maxChars);
    const slice = normalized.slice(cursor, end);
    chunks.push(slice.trim());

    if (end >= normalized.length) break;
    cursor = Math.max(0, end - overlap);
  }

  return chunks.filter(Boolean);
}

export function summarizeKeywords(text, max = 20) {
  const counts = new Map();
  for (const token of tokenize(text)) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([word]) => word);
}

export function roughTokenCount(text) {
  return tokenize(text).length;
}
