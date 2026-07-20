import { NextResponse } from "../../../../utils/next-response.js";
import Anthropic from "@anthropic-ai/sdk";
import connectDB from "../../../../lib/db.js";
import Transcript from "../../../../app/models/Transcript.js";
import MeetingSummary from "../../../../app/models/MeetingSummary.model.js";

export const runtime = "nodejs";

const anthropic = new Anthropic({
  apiKey: process.env.CLOUDAPI,
});

export async function POST(req) {
  let roomId;

  try {
    await connectDB();

    const body = await req.json();
    roomId = body.roomId;
    const userId = body.userId;

    if (!roomId) {
      return NextResponse.json({ error: "roomId is required" }, { status: 400 });
    }

    await MeetingSummary.findOneAndUpdate(
      { roomId },
      { roomId, userId, status: "generating" },
      { upsert: true, new: true }
    );

    const transcripts = await Transcript.find({ roomId })
      .sort({ createdAt: 1 })
      .lean();

    if (!transcripts.length) {
      await MeetingSummary.findOneAndUpdate(
        { roomId },
        { status: "failed", error: "No transcripts found" }
      );
      return NextResponse.json({ error: "No transcripts found for this room" }, { status: 404 });
    }

    const participantsMap = new Map();
    transcripts.forEach((t) => {
      if (t.participantId && !participantsMap.has(t.participantId)) {
        participantsMap.set(t.participantId, {
          participantId: t.participantId,
          participantName: t.participantName,
        });
      }
    });
    const participants = Array.from(participantsMap.values());

    const conversationLog = transcripts
      .filter((t) => t.text && t.text !== "[NO SPEECH DETECTED]")
      .map((t) => `${t.participantName || "Unknown"}: ${t.text}`)
      .join("\n");

    if (!conversationLog.trim()) {
      await MeetingSummary.findOneAndUpdate(
        { roomId },
        { status: "failed", error: "No speech detected in this meeting" }
      );
      return NextResponse.json({ error: "No speech detected in this meeting" }, { status: 404 });
    }

    const claudeResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: `
You are a meeting summarizer.

You will receive the full transcript of a meeting in the format:
Name: what they said

Your job:
- Identify each distinct participant by name.
- Summarize what each participant said and contributed.
- Capture key discussion points, decisions, objections, and action items.
- Write the summary in clear plain text, organized by participant, followed by an overall meeting summary and action items.
- Do NOT use markdown symbols like # or *.
- Be concise but complete. Do not omit important points.

Output format:

Participants Summary:
<Name 1>: <what they discussed/contributed>
<Name 2>: <what they discussed/contributed>

Overall Meeting Summary:
<short paragraph covering the whole meeting>

Action Items:
<list, or "None" if none>
      `,
      messages: [
        {
          role: "user",
          content: conversationLog,
        },
      ],
    });

    const summaryText = claudeResponse.content?.[0]?.text || "";

    const saved = await MeetingSummary.findOneAndUpdate(
      { roomId },
      {
        roomId,
        userId,
        participants,
        transcriptCount: transcripts.length,
        summary: summaryText,
        status: "ready",
        error: "",
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true, meetingSummary: saved });
  } catch (err) {
    console.error("GENERATE SUMMARY ERROR:", err);
    if (roomId) {
      await MeetingSummary.findOneAndUpdate(
        { roomId },
        { status: "failed", error: err.message }
      ).catch(() => {});
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}