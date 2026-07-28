import { NextResponse } from "../../../../utils/next-response.js";
import connectDB from "../../../../lib/db.js";
import SkillMetric from "../../../models/SkillMetric.model.js";

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

    const skills = await SkillMetric.find({ user_id: userId }).lean();

    return NextResponse.json({
      success: true,
      skills: skills.map((s) => ({
        id: s._id.toString(),
        trait_name: s.trait_name,
        current_score: s.current_score,
        previous_score: s.previous_score,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch skills" },
      { status: 500 },
    );
  }
}

// Upserts a trait score. Each call rotates the prior current_score into
// previous_score so the radar chart can show "today vs. last time".
// score must be a 0-1 fraction (the frontend renders it as a fraction of R).
export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();
    const { user_id, trait_name, score } = body;

    if (!user_id || !trait_name) {
      return NextResponse.json(
        { success: false, error: "user_id and trait_name are required" },
        { status: 400 },
      );
    }

    const clampedScore = Math.max(0, Math.min(1, Number(score) || 0));

    const existing = await SkillMetric.findOne({ user_id, trait_name });

    const updated = await SkillMetric.findOneAndUpdate(
      { user_id, trait_name },
      {
        user_id,
        trait_name,
        current_score: clampedScore,
        previous_score: existing ? existing.current_score : 0,
      },
      { upsert: true, new: true },
    );

    return NextResponse.json(
      {
        success: true,
        skill: {
          id: updated._id.toString(),
          trait_name: updated.trait_name,
          current_score: updated.current_score,
          previous_score: updated.previous_score,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to save skill metric" },
      { status: 500 },
    );
  }
}
