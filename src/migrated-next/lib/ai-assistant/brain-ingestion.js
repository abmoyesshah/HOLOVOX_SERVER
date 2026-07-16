import PDFParser from "pdf2json";
import BrainFile from "../../app/models/BrainFile.model.js";
import BrainChunk from "../../app/models/BrainChunk.model.js";
import { getBrainFilesBucket, toObjectId } from "../gridfs.js";
import { chunkText, normalizeText, roughTokenCount, summarizeKeywords } from "./text-utils.js";

async function streamToBuffer(stream) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

async function extractTextFromBuffer(buffer, mimeType) {
  if (!buffer || buffer.length === 0) return "";

  if (mimeType === "application/pdf") {
    const parser = new PDFParser();
    const parsedText = await new Promise((resolve, reject) => {
      parser.on("pdfParser_dataReady", (pdfData) => {
        try {
          const text = pdfData.Pages.map((page) =>
            page.Texts.map((item) => decodeURIComponent(item.R?.[0]?.T || "")).join(" "),
          ).join("\n");
          resolve(text);
        } catch (error) {
          reject(error);
        }
      });
      parser.on("pdfParser_dataError", (error) => reject(error));
      parser.parseBuffer(buffer);
    });

    return normalizeText(parsedText);
  }

  return normalizeText(buffer.toString("utf-8"));
}

export async function ingestBrainFile(fileDoc) {
  const bucket = await getBrainFilesBucket();
  const downloadStream = bucket.openDownloadStream(toObjectId(fileDoc.gridfs_file_id));
  const buffer = await streamToBuffer(downloadStream);

  const text = await extractTextFromBuffer(buffer, fileDoc.file_type);
  const chunks = chunkText(text);

  await BrainChunk.deleteMany({ file_id: fileDoc._id.toString(), user_id: fileDoc.user_id });

  if (chunks.length === 0) {
    await BrainFile.findByIdAndUpdate(fileDoc._id, {
      ingestion_status: "failed",
      ingestion_error: "No extractable text found in file",
      chunk_count: 0,
      parse_chars: 0,
      last_ingested_at: new Date(),
    });

    return { chunkCount: 0, parseChars: 0 };
  }

  const chunkDocs = chunks.map((textChunk, index) => ({
    user_id: fileDoc.user_id,
    file_id: fileDoc._id.toString(),
    file_name: fileDoc.file_name,
    chunk_index: index,
    text: textChunk,
    keywords: summarizeKeywords(textChunk),
    token_count: roughTokenCount(textChunk),
  }));

  await BrainChunk.insertMany(chunkDocs, { ordered: true });

  await BrainFile.findByIdAndUpdate(fileDoc._id, {
    ingestion_status: "ready",
    ingestion_error: "",
    chunk_count: chunkDocs.length,
    parse_chars: text.length,
    last_ingested_at: new Date(),
  });

  return { chunkCount: chunkDocs.length, parseChars: text.length };
}
