// import AssistantInfo from "@/app/models/AssistantInfo.model";
import { NextResponse } from "../../../../utils/next-response.js";
import AssistantInfo from "../../../models/AssistantInfo.model.js";
import Profile from "../../../models/Profile.model.js";
import connectDB from "../../../../lib/db.js";
// CREATE ASSISTANT INFO
export async function POST(req) {
  try {
    await connectDB();
    const body = await req.json();

    const assistantInfo = await AssistantInfo.create(body);
    const userId = body.userId; // Assuming userId is sent in the request body
   const updateProfile = await Profile.findByIdAndUpdate(
      userId,
      { meetingUsed: true },
      { new: true } // 🔥 important: returns updated document
    );
    return NextResponse.json({
      success: true,
      assistantInfo: assistantInfo,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// GET ALL ASSISTANT INFOS (optional admin/debug)
export async function GET(req) {
  try {
    await connectDB();
    // get userId from query
    const { searchParams } = new URL(req.url);

    const userId = searchParams.get("userId");
     // check userId
        if (!userId) {
          return NextResponse.json(
            {
              success: false,
              error: "User ID is required",
            },
            { status: 400 }
          );
        }
    const assistantInfos = await AssistantInfo.find({ userId: userId }).lean();

    return NextResponse.json({ success: true, assistantInfos });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
// UPDATE user (onboarding edit / profile update)
export async function PATCH(
  req
) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);

    const userId = searchParams.get("userId");
     // check userId
        if (!userId) {
          return NextResponse.json(
            {
              success: false,
              error: "User ID is required",
            },
            { status: 400 }
          );
        }

          const body = await req.json(); // 🔥 FIXED
    const updatedUser = await AssistantInfo.findByIdAndUpdate(
      { userId: userId },
      body,
      { new: true }
    );

    if (!updatedUser) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      assistantInfo: updatedUser,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}   