// lib/brainingestion/index.js
// This file is deprecated - use brain-chunking.service.js instead
// Keeping for backward compatibility

import { getFileFromGridFS, deleteFileFromGridFS } from "../gridfs.js";
import BrainFile from "../../app/models/BrainFile.model.js";
import BrainChunk from "../../app/models/BrainChunk.model.js";
import { processBrainFile } from "../../app/api/holo-assist/brain-chunking.service.js";

/**
 * @deprecated Use processBrainFile from brain-chunking.service.js instead
 * This function is kept for backward compatibility
 */
export async function ingestBrainFile(fileDoc) {
  console.warn("⚠️ ingestBrainFile is deprecated. Use processBrainFile from brain-chunking.service.js");
  
  try {
    // Get the file buffer from GridFS
    const buffer = await getFileFromGridFS(fileDoc.gridfs_file_id, fileDoc.bucket_name || "brainFiles");
    
    // Use the new processing function
    const result = await processBrainFile(
      buffer,
      {
        fileName: fileDoc.file_name,
        fileType: fileDoc.file_type,
        fileSize: fileDoc.file_size,
        gridfsFileId: fileDoc.gridfs_file_id,
        bucketName: fileDoc.bucket_name || "brainFiles",
      },
      fileDoc.user_id
    );
    
    return {
      chunkCount: result.totalChunks,
      parseChars: result.file?.parse_chars || 0,
    };
  } catch (error) {
    console.error("Error in ingestBrainFile (deprecated):", error);
    
    // Update file status to failed
    await BrainFile.findByIdAndUpdate(fileDoc._id, {
      ingestion_status: "failed",
      ingestion_error: error.message,
      last_ingested_at: new Date(),
    });
    
    throw error;
  }
}

/**
 * @deprecated Use processMultipleBrainFiles from brain-chunking.service.js instead
 */
export async function ingestMultipleBrainFiles(fileDocs) {
  console.warn("⚠️ ingestMultipleBrainFiles is deprecated. Use processMultipleBrainFiles from brain-chunking.service.js");
  
  const results = [];
  for (const fileDoc of fileDocs) {
    try {
      const result = await ingestBrainFile(fileDoc);
      results.push({ success: true, fileId: fileDoc._id, ...result });
    } catch (error) {
      results.push({ success: false, fileId: fileDoc._id, error: error.message });
    }
  }
  return results;
}

/**
 * Delete a brain file and its associated chunks
 */
export async function deleteBrainFile(fileId, userId) {
  const fileDoc = await BrainFile.findOne({ _id: fileId, user_id: userId });
  if (!fileDoc) {
    throw new Error("File not found");
  }

  // Delete chunks
  await BrainChunk.deleteMany({ file_id: fileId, user_id: userId });

  // Delete from GridFS
  await deleteFileFromGridFS(fileDoc.gridfs_file_id, fileDoc.bucket_name || "brainFiles");

  // Delete file record
  await BrainFile.findByIdAndDelete(fileId);

  return { success: true };
}

/**
 * Re-ingest a brain file (useful for updating after schema changes)
 */
export async function reingestBrainFile(fileId, userId) {
  const fileDoc = await BrainFile.findOne({ _id: fileId, user_id: userId });
  if (!fileDoc) {
    throw new Error("File not found");
  }

  // Delete existing chunks
  await BrainChunk.deleteMany({ file_id: fileId, user_id: userId });

  // Re-ingest
  return await ingestBrainFile(fileDoc);
}

/**
 * Get file status and stats
 */
export async function getFileStatus(fileId, userId) {
  const fileDoc = await BrainFile.findOne({ _id: fileId, user_id: userId });
  if (!fileDoc) {
    throw new Error("File not found");
  }

  const chunkCount = await BrainChunk.countDocuments({ file_id: fileId, user_id: userId });
  
  return {
    file: fileDoc,
    chunkCount,
    status: fileDoc.ingestion_status,
    error: fileDoc.ingestion_error,
    lastIngested: fileDoc.last_ingested_at,
  };
}