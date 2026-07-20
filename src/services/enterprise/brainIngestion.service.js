import zlib from "node:zlib";
import { PDFParse } from "pdf-parse";

const normalizeWord = (word) => word.toLowerCase().replace(/[^\w\s'-]/g, "").trim();

const decodeXmlEntities = (value) =>
  String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

const stripXmlTags = (value) => decodeXmlEntities(String(value || "").replace(/<[^>]+>/g, " "));

const isPdfFile = (file) =>
  file?.mimetype === "application/pdf" || /\.pdf$/i.test(file?.originalname || "");

const isXlsxFile = (file) =>
  file?.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
  /\.xlsx$/i.test(file?.originalname || "");

const extractTextFromPdf = async (buffer) => {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("PDF parsing timed out")), 20000);
  });

  const parser = new PDFParse({ data: buffer });
  try {
    const result = await Promise.race([parser.getText(), timeoutPromise]);
    return String(result?.text || "")
      .replace(/\r/g, "\n")
      .replace(/^--\s*\d+\s*of\s*\d+\s*--$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } catch (error) {
    throw new Error(error?.message || "Failed to parse PDF");
  } finally {
    if (typeof parser.destroy === "function") {
      await parser.destroy().catch(() => {});
    }
  }
};

const readZipEntries = (buffer) => {
  const entries = new Map();
  const eocdSignature = 0x06054b50;
  let eocdOffset = -1;

  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === eocdSignature) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset < 0) return entries;

  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  let offset = centralDirectoryOffset;

  while (offset < centralDirectoryEnd && buffer.readUInt32LE(offset) === 0x02014b50) {
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.toString("utf8", offset + 46, offset + 46 + fileNameLength);

    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

    let content = null;
    if (compressionMethod === 0) {
      content = compressed;
    } else if (compressionMethod === 8) {
      content = zlib.inflateRawSync(compressed);
    }

    if (content) entries.set(fileName, content);
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
};

const extractTextFromXlsx = (buffer) => {
  const entries = readZipEntries(buffer);
  const chunks = [];

  for (const [name, content] of entries) {
    if (
      name === "xl/sharedStrings.xml" ||
      /^xl\/worksheets\/sheet\d+\.xml$/i.test(name)
    ) {
      const xml = content.toString("utf8");
      const textNodes = [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXmlEntities(match[1]));
      if (textNodes.length) {
        chunks.push(textNodes.join("\n"));
      } else {
        chunks.push(stripXmlTags(xml));
      }
    }
  }

  return chunks.join("\n").replace(/\n{3,}/g, "\n\n").trim();
};

export const extractTextFromUpload = async (file) => {
  if (!file?.buffer) return { text: "", error: "No file contents were received" };

  const textLike =
    file.mimetype?.startsWith("text/") ||
    file.mimetype?.includes("json") ||
    file.mimetype?.includes("csv") ||
    /\.(txt|csv|json|md)$/i.test(file.originalname || "");

  try {
    if (textLike) return { text: file.buffer.toString("utf8"), error: "" };

    if (isPdfFile(file)) {
      const text = await extractTextFromPdf(file.buffer);
      return {
        text,
        error: text ? "" : "No extractable text was found in this PDF (it may be a scanned image without a text layer)",
      };
    }

    if (isXlsxFile(file)) {
      const text = extractTextFromXlsx(file.buffer);
      return { text, error: text ? "" : "No text cells were found in this spreadsheet" };
    }

    return {
      text: "",
      error: "Unsupported file type. Supported formats: txt, csv, json, md, pdf, xlsx",
    };
  } catch (error) {
    return { text: "", error: error?.message || "Failed to parse this file" };
  }
};

export const getDefaultTrainingWordType = (fileName = "") =>
  /permit|allowed|allow/i.test(fileName) ? "permitted" : "flag";

export const parseTrainingWords = (text, defaultType = "flag") => {
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
      : defaultType === "permitted"
        ? "permitted"
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