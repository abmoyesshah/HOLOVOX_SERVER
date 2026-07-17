// app/api/user/test/route.js
import { NextResponse } from "next/server";

console.log("✅ Test route loaded at /api/user/test");

export async function GET() {
  console.log("📥 GET /api/user/test - Request received");
  return NextResponse.json({ 
    success: true, 
    message: "Test route is working!",
    timestamp: new Date().toISOString()
  });
}

export async function POST() {
  console.log("📥 POST /api/user/test - Request received");
  return NextResponse.json({ 
    success: true, 
    message: "POST test route is working!",
    timestamp: new Date().toISOString()
  });
}