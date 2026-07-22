// app/api/ai-assistant/brain-files/upload/route.js
import { NextResponse } from "../../../../../utils/next-response.js";
import connectDB from "../../../../../lib/db.js";
import BrainFile from "../../../../../app/models/BrainFile.model.js";
import DashboardSession from "../../../../../app/models/DashboardSession.model.js";
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

    console.log(`📊 Fetching dashboard data for user: ${userId}`);

    // Fetch both data in parallel for better performance
    const [files, sessions] = await Promise.all([
      // Fetch brain files
      BrainFile.find({ user_id: userId })
        .sort({ createdAt: -1 })
        .lean(),
      
      // Fetch dashboard sessions
      DashboardSession.find({ user_id: userId })
        .sort({ session_date: -1, createdAt: -1 })
        .lean()
    ]);

    // Format files response
    const formattedFiles = files.map(f => ({
      id: f._id,
      fileName: f.file_name,
      fileSize: f.file_size,
      fileType: f.file_type,
      status: f.ingestion_status,
      chunkCount: f.chunk_count,
      createdAt: f.createdAt,
      lastIngested: f.last_ingested_at,
    }));

    // Format sessions response
    const formattedSessions = sessions.map(session => ({
      ...session,
      id: session._id.toString(),
    }));

      const totalSessions = sessions.length;
  const avgCards = totalSessions
    ? Math.round(
        sessions.reduce((acc, session) => acc + (session.cards_used_pct || 0), 0) /
          totalSessions,
      )
    : 0;
  const totalRecoveries = sessions.reduce(
    (acc, session) => acc + (session.recoveries || 0),
    0,
  );
    // Calculate stats
    const stats = {
      sessions: sessions.length,
      cards: avgCards,
      recoveries: totalRecoveries,
      files: files.length,
      processedFiles: files.filter(f => f.ingestion_status === 'ready').length,
      pendingFiles: files.filter(f => f.ingestion_status === 'pending').length,
      failedFiles: files.filter(f => f.ingestion_status === 'failed').length,
      totalChunks: files.reduce((sum, f) => sum + (f.chunk_count || 0), 0),
    };

    console.log(`✅ Found ${files.length} files and ${sessions.length} sessions for user ${userId}`);

    return NextResponse.json({
      success: true,
      // Files data
      files: formattedFiles,
      sources: formattedFiles, // For backward compatibility
      
      // Sessions data
      sessions: formattedSessions.length > 0 ? formattedSessions : getSeedSessions(userId),
      
      // Stats
      stats: {
        sessions: sessions.length,
        files: files.length,
        processedFiles: files.filter(f => f.ingestion_status === 'ready').length,
        pendingFiles: files.filter(f => f.ingestion_status === 'pending').length,
        failedFiles: files.filter(f => f.ingestion_status === 'failed').length,
        totalChunks: files.reduce((sum, f) => sum + (f.chunk_count || 0), 0),
      },
      
      // Additional dashboard data (default values)
      pwr: sessions.length > 0 ? Math.min(sessions.length * 10, 100) : 0,
      deskQuote: files.length > 0 
        ? `Brain has ${files.length} files loaded with ${stats.totalChunks} chunks ready` 
        : "Feed it files. Watch the Brain charge.",
      debriefs: [],
      playbooks: [],
      skills: [],
      journal: [],
      goal: sessions.length > 0 ? "Continue building your knowledge base" : "Set your first goal.",
    });
  } catch (error) {
    console.error("❌ Error fetching dashboard data:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || "Failed to fetch dashboard data" 
      },
      { status: 500 }
    );
  }
}

/**
 * Helper function to generate seed sessions for new users
 */
function getSeedSessions(userId) {
  return [
    {
      id: `seed-${Date.now()}-1`,
      user_id: userId,
      session_date: new Date().toISOString().split('T')[0],
      session_type: 'discovery',
      title: 'Welcome to Holo Assist',
      summary: 'Start your first meeting to generate insights',
      metrics: {
        duration: 0,
        insights: 0,
        actionItems: 0,
      },
      createdAt: new Date(),
    }
  ];
}