const normalizeWord = (word) => word.toLowerCase().replace(/[^\w\s'-]/g, "").trim();

export const extractTextFromUpload = (file) => {
  if (!file?.buffer) return "";
  const textLike =
    file.mimetype?.startsWith("text/") ||
    file.mimetype?.includes("json") ||
    file.mimetype?.includes("csv") ||
    /\.(txt|csv|json|md)$/i.test(file.originalname || "");

  if (!textLike) return "";
  return file.buffer.toString("utf8");
};

export const parseTrainingWords = (text) => {
  const words = [];
  const lines = String(text || "")
    .split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^(flag|flagged|deny|permitted|permit|allow|allowed)\s*[:=-]\s*(.+)$/i);
    const type = match
      ? /permit|allow/i.test(match[1])
        ? "permitted"
        : "flag"
      : "flag";
    const rawWord = match ? match[2] : line;
    const word = rawWord.replace(/^["']|["']$/g, "").trim();
    const normalizedWord = normalizeWord(word);
    if (!normalizedWord) continue;

    words.push({
      word,
      normalizedWord,
      type,
      severity: type === "flag" ? "medium" : "low",
      category: "brain-file",
    });
  }

  return words;
};
