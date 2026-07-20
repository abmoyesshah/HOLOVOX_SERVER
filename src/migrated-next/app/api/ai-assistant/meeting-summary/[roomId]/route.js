import { NextResponse } from "../../../../../utils/next-response.js";
import connectDB from "../../../../../lib/db.js";
import MeetingSummary from "../../../../../app/models/MeetingSummary.model.js";

export const runtime = "nodejs";

export async function GET(req, { params }) {
  try {
    await connectDB();

    const { roomId } = await params;

    const summary = await MeetingSummary.findOne({ roomId }).lean();

    if (!summary) {
      return NextResponse.json({ error: "Summary not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, summary });
  } catch (err) {
    console.error("GET SUMMARY ERROR:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}