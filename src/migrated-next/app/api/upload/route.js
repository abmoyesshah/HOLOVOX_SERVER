// app/api/upload/route.js
import { NextResponse } from "../../../utils/next-response.js";
import { v2 as cloudinary } from "cloudinary";

// Configure Cloudinary with proper error handling
const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

cloudinary.config({
  cloud_name: cloudName || "dxokooosv",
  api_key: apiKey || "682326636258828",
  api_secret: apiSecret || "n85eaJkyKUT6RCrAIMASsNiWhaI",
});

export async function POST(req) {
  try {
    // ✅ Get formData properly
    const formData = await req.formData();
    
    // ✅ Get the file - this is the correct way
    const file = formData.get("image");

    // ✅ Log file info without using entries()
    console.log("📁 File received:", file ? file.name : "No file");
    console.log("📁 File type:", file ? file.type : "N/A");
    console.log("📁 File size:", file ? file.size : "N/A");

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File size should be less than 5MB" }, { status: 400 });
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: "holovox/profile",
          resource_type: "auto",
          quality: "auto",
          fetch_format: "auto",
        },
        (error, result) => {
          if (error) {
            console.error("❌ Cloudinary upload error:", error);
            reject(error);
          } else {
            console.log("✅ Cloudinary upload successful:", result.public_id);
            resolve(result);
          }
        }
      ).end(buffer);
    });

    return NextResponse.json({ 
      success: true,
      url: result.secure_url,
      public_id: result.public_id,
      format: result.format,
      width: result.width,
      height: result.height,
    });
  } catch (error) {
    console.error("❌ Upload error:", error);
    return NextResponse.json(
      { error: "Upload failed: " + (error.message || "Unknown error") },
      { status: 500 }
    );
  }
}