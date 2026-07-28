import { NextResponse } from "../../../../utils/next-response.js";
import connectDB from "../../../../lib/db.js";
import WinJournal from "../../../models/WinJournal.model.js";

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

    const journal = await WinJournal.find({ user_id: userId })
      .sort({ entry_date: -1 })
      .limit(20)
      .lean();

    return NextResponse.json({
      success: true,
      journal: journal.map((j) => ({
        id: j._id.toString(),
        entry_date: j.entry_date,
        topic: j.topic,
        entry_text: j.entry_text,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch journal" },
      { status: 500 },
    );
  }
}

export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();
    const { user_id, topic = "", entry_text = "", entry_date } = body;

    if (!user_id || !entry_text) {
      return NextResponse.json(
        { success: false, error: "user_id and entry_text are required" },
        { status: 400 },
      );
    }

    const entry = await WinJournal.create({
      user_id,
      topic,
      entry_text,
      entry_date: entry_date ? new Date(entry_date) : new Date(),
    });

    return NextResponse.json(
      {
        success: true,
        entry: {
          id: entry._id.toString(),
          entry_date: entry.entry_date,
          topic: entry.topic,
          entry_text: entry.entry_text,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to save journal entry" },
      { status: 500 },
    );
  }
}
