import { NextResponse } from "../../../../utils/next-response.js";
import connectDB from "../../../../lib/db.js";
import HoloAssistQuestionnaire from "../../../models/HoloAssistQuestionnaire.model.js";
import { resolveRequestUserId } from "../../../../lib/auth-user.js";

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const queryUserId = searchParams.get("userId") || "";
    const userId = resolveRequestUserId(req, queryUserId);

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "userId is required" },
        { status: 400 },
      );
    }

    const profile = await HoloAssistQuestionnaire.findOne({ user_id: userId }).lean();

    return NextResponse.json({
      success: true,
      profile: profile
        ? {
            ...profile,
            id: profile._id.toString(),
          }
        : null,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch profile" },
      { status: 500 },
    );
  }
}

export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();
    const { user_id: bodyUserId, ...rest } = body;
    const user_id = resolveRequestUserId(req, bodyUserId);

    if (!user_id) {
      return NextResponse.json(
        { success: false, error: "user_id is required" },
        { status: 400 },
      );
    }

    const profile = await HoloAssistQuestionnaire.findOneAndUpdate(
      { user_id },
      {
        ...rest,
        user_id,
        updated_at: new Date(),
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    ).lean();

    return NextResponse.json({
      success: true,
      profile: {
        ...profile,
        id: profile._id.toString(),
      },
    });
  } catch (error) {
    if (error?.name === "AuthIdentityMismatch") {
      return NextResponse.json(
        { success: false, error: "Unauthorized user identity" },
        { status: 403 },
      );
    }

    console.error("❌ Error saving profile:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to save profile" },
      { status: 500 },
    );
  }
}