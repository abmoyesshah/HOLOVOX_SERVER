import { NextResponse } from "../../../../utils/next-response.js";
import connectDB from "../../../../lib/db.js";
import DashboardSession from "../../../models/DashboardSession.model.js";
import { getSeedSessions } from "../../../../lib/holo-assist-seeds.js";

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

    const sessions = await DashboardSession.find({ user_id: userId })
      .sort({ session_date: -1, createdAt: -1 })
      .lean();

    const normalizedSessions = sessions.map((session) => ({
      ...session,
      id: session._id.toString(),
    }));

    return NextResponse.json({
      success: true,
      sessions:
        normalizedSessions.length > 0
          ? normalizedSessions
          : getSeedSessions(userId),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch sessions" },
      { status: 500 },
    );
  }
}

export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();
    const {
      user_id,
      topic = "",
      duration_mins = 0,
      cards_used_pct = 0,
      recoveries = 0,
      strongest = "",
      work_on = "",
      session_date,
    } = body;

    if (!user_id) {
      return NextResponse.json(
        { success: false, error: "user_id is required" },
        { status: 400 },
      );
    }

    const session = await DashboardSession.create({
      user_id,
      topic,
      duration_mins,
      cards_used_pct,
      recoveries,
      strongest,
      work_on,
      session_date: session_date ? new Date(session_date) : new Date(),
    });

    return NextResponse.json(
      {
        success: true,
        session: {
          id: session._id.toString(),
          user_id: session.user_id,
          topic: session.topic,
          duration_mins: session.duration_mins,
          cards_used_pct: session.cards_used_pct,
          recoveries: session.recoveries,
          strongest: session.strongest,
          work_on: session.work_on,
          session_date: session.session_date,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to save session" },
      { status: 500 },
    );
  }
}