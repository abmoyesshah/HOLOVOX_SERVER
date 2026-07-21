// app/api/ai-assistant/brain-files/upload/route.js
import { NextResponse } from "../../../../../utils/next-response.js";
import connectDB from "../../../../../lib/db.js";
import BrainFile from "../../../../../app/models/BrainFile.model.js";
import { processBrainFile } from "../../../../api/holo-assist/brain-chunking.service.js";
import { resolveRequestUserId } from "../../../../../lib/auth-user.js";
import { getGridFSBucket } from "../../../../../lib/gridfs.js";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for large files

export async function POST(req) {
  try {
    await connectDB();

    const formData = await req.formData();
    const file = formData.get("file");
    const userId = resolveRequestUserId(req, formData.get("userId") || "");
    const bucketName = formData.get("bucketName") || "brainFiles";

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    // Get file info
    const fileName = file.name;
    const fileType = file.type || "application/octet-stream";
    const fileSize = file.size;

    // Read file buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Step 1: Save file to GridFS
    const bucket = getGridFSBucket(bucketName);
    const uploadStream = bucket.openUploadStream(fileName, {
      metadata: {
        userId,
        fileType,
        uploadedAt: new Date(),
      },
    });

    const fileId = uploadStream.id;
    uploadStream.end(buffer);

    // Wait for upload to complete
    await new Promise((resolve, reject) => {
      uploadStream.on("finish", resolve);
      uploadStream.on("error", reject);
    });

    // Step 2: Create file record in database
    const brainFile = await BrainFile.create({
      user_id: userId,
      file_name: fileName,
      file_path: `${bucketName}/${fileName}`,
      file_size: fileSize,
      file_type: fileType,
      gridfs_file_id: fileId.toString(),
      bucket_name: bucketName,
      ingestion_status: "pending",
    });

    // Step 3: Process file (asynchronously or synchronously)
    // For large files, you might want to use a queue system
    const processingResult = await processBrainFile(
      buffer,
      {
        fileName,
        fileType,
        fileSize,
        gridfsFileId: fileId.toString(),
        bucketName,
      },
      userId
    );

    return NextResponse.json({
      success: true,
      file: {
        id: brainFile._id,
        fileName,
        fileSize,
        fileType,
        status: "ready",
        chunks: processingResult.totalChunks,
        topicsExtracted: processingResult.topicsExtracted,
      },
    });
  } catch (error) {
    console.error("File upload error:", error);
    return NextResponse.json(
      { error: error.message || "File processing failed" },
      { status: 500 }
    );
  }
}

// Get list of brain files for a user
export async function GET(req) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const userId = resolveRequestUserId(req, searchParams.get("userId") || "");
    
    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    const files = await BrainFile.find({ user_id: userId })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      files: files.map(f => ({
        id: f._id,
        fileName: f.file_name,
        fileSize: f.file_size,
        fileType: f.file_type,
        status: f.ingestion_status,
        chunkCount: f.chunk_count,
        createdAt: f.createdAt,
        lastIngested: f.last_ingested_at,
      })),
    });
  } catch (error) {
    console.error("Error fetching brain files:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}