import zlib from "node:zlib";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
const stripListPrefix = (word) =>
  String(word || "").replace(/^\s*\d+[\).:-]\s*/, "").trim();

const normalizeWord = (word) => stripListPrefix(word).toLowerCase().replace(/[^\w\s'-]/g, "").trim();

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

const isDocxFile = (file) =>
  file?.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
  /\.docx$/i.test(file?.originalname || "");

// const extractTextFromPdf = (buffer) =>
//   new Promise((resolve, reject) => {
//     const parser = new PDFParser();
//     const timeout = setTimeout(() => {
//       reject(new Error("PDF parsing timed out"));
//     }, 20000);

//     parser.on("pdfParser_dataError", (error) => {
//       clearTimeout(timeout);
//       reject(error?.parserError || error || new Error("Failed to parse PDF"));
//     });

//     parser.on("pdfParser_dataReady", () => {
//       try {
//         clearTimeout(timeout);
//         resolve(parser.getRawTextContent().replace(/\r/g, "\n"));
//       } catch (error) {
//         clearTimeout(timeout);
//         reject(error);
//       }
//     });

//     parser.parseBuffer(buffer);
//   });
const extractTextFromPdf = async (buffer) => {
  const data = await pdfParse(buffer);
  return data.text;
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
const extractTextFromDocx = (buffer) => {
  const entries = readZipEntries(buffer);
  const documentXml = entries.get("word/document.xml");
  if (!documentXml) return "";

  const xml = documentXml.toString("utf8");
  const paragraphs = xml.split(/<\/w:p>/);

  const lines = paragraphs.map((paragraph) => {
    const textNodes = [...paragraph.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
      .map((match) => decodeXmlEntities(match[1]));
    return textNodes.join("");
  });

  return lines.filter(Boolean).join("\n").replace(/\n{3,}/g, "\n\n").trim();
};

export const extractTextFromUpload = async (file) => {
  if (!file?.buffer) return "";
  const textLike =
    file.mimetype?.startsWith("text/") ||
    file.mimetype?.includes("json") ||
    file.mimetype?.includes("csv") ||
    /\.(txt|csv|json|md)$/i.test(file.originalname || "");

  if (textLike) return file.buffer.toString("utf8");
  if (isPdfFile(file)) return extractTextFromPdf(file.buffer);
  if (isXlsxFile(file)) return extractTextFromXlsx(file.buffer);
  if (isDocxFile(file)) return extractTextFromDocx(file.buffer);


  return "";
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
    const word = stripListPrefix(rawWord.replace(/^["']|["']$/g, ""));
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
