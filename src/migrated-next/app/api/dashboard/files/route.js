import { NextResponse } from "../../../../utils/next-response.js";
import { Readable } from "stream";
import connectDB from "../../../../lib/db.js";
import BrainFile from "../../../models/BrainFile.model.js";
import BrainChunk from "../../../models/BrainChunk.model.js";
import { getBrainFilesBucket, toObjectId } from "../../../../lib/gridfs.js";
import { ingestBrainFile } from "../../../../lib/ai-assistant/brain-ingestion.js";

export const runtime = "nodejs";

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function normalizeFile(fileDoc) {
  return {
    id: fileDoc._id.toString(),
    file_name: fileDoc.file_name,
    file_path: fileDoc.file_path,
    file_size: fileDoc.file_size,
    file_type: fileDoc.file_type,
    ingestion_status: fileDoc.ingestion_status || "pending",
    chunk_count: fileDoc.chunk_count || 0,
    last_ingested_at: fileDoc.last_ingested_at || null,
    created_at: fileDoc.createdAt,
  };
}

async function uploadToGridFS({ bucket, file, userId }) {
  const buffer = Buffer.from(await file.arrayBuffer());

  return await new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(file.name, {
      contentType: file.type || "application/octet-stream",
      metadata: {
        userId,
        originalName: file.name,
      },
    });

    Readable.from(buffer)
      .pipe(uploadStream)
      .on("error", reject)
      .on("finish", () => resolve(uploadStream.id.toString()));
  });
}

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "userId is required" },
        { status: 400 },
      );
    }

    const files = await BrainFile.find({ user_id: userId })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      sources: files.map(normalizeFile),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch files" },
      { status: 500 },
    );
  }
}

export async function POST(req) {
  try {
    await connectDB();

    const formData = await req.formData();
    const userId = formData.get("userId");
    const file = formData.get("file");

    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { success: false, error: "userId is required" },
        { status: 400 },
      );
    }

    if (!file || typeof file === "string") {
      return NextResponse.json(
        { success: false, error: "file is required" },
        { status: 400 },
      );
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid file type. Use PDF, DOCX, or CSV.",
        },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "File too large. Max 10MB." },
        { status: 400 },
      );
    }

    const bucket = await getBrainFilesBucket();
    const gridfsFileId = await uploadToGridFS({ bucket, file, userId });

    const fileDoc = await BrainFile.create({
      user_id: userId,
      file_name: file.name,
      file_path: `${userId}/${gridfsFileId}`,
      file_size: file.size,
      file_type: file.type,
      gridfs_file_id: gridfsFileId,
      bucket_name: "brainFiles",
      ingestion_status: "pending",
    });

    try {
      await ingestBrainFile(fileDoc);
    } catch (ingestError) {
      await BrainFile.findByIdAndUpdate(fileDoc._id, {
        ingestion_status: "failed",
        ingestion_error: ingestError instanceof Error ? ingestError.message : "Ingestion failed",
        last_ingested_at: new Date(),
      });
    }

    const refreshedFileDoc = await BrainFile.findById(fileDoc._id).lean();

    return NextResponse.json(
      {
        success: true,
        file: normalizeFile(refreshedFileDoc || fileDoc),
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || "Upload failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(req) {
  try {
    await connectDB();

    const body = await req.json();
    const { id, userId } = body;

    if (!id || !userId) {
      return NextResponse.json(
        { success: false, error: "id and userId are required" },
        { status: 400 },
      );
    }

    const fileDoc = await BrainFile.findOne({ _id: id, user_id: userId });

    if (!fileDoc) {
      return NextResponse.json(
        { success: false, error: "File not found" },
        { status: 404 },
      );
    }

    const bucket = await getBrainFilesBucket();
    await bucket.delete(toObjectId(fileDoc.gridfs_file_id));
    await BrainChunk.deleteMany({ file_id: id, user_id: userId });
    await BrainFile.deleteOne({ _id: id, user_id: userId });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || "Delete failed" },
      { status: 500 },
    );
  }
}