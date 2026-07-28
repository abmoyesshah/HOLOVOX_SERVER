// app/api/ai-assistant/generate-summary/route.js
import { NextResponse } from "../../../../utils/next-response.js";
import Anthropic from "@anthropic-ai/sdk";
import connectDB from "../../../../lib/db.js";
import Summary from "../../../../app/models/Summaries.model.js";
import Event from "../../../../app/models/Event.model.js";
import { recordCoachingSignals } from "../../../../lib/coaching-signals.js";

export const runtime = "nodejs";

const anthropic = new Anthropic({
  apiKey: process.env.CLOUDAPI,
});

export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();
    const { meetingId, userId, transcripts, meetingTitle = "Meeting" } = body;

    // Validate
    if (!meetingId) {
      return NextResponse.json(
        {
          success: false,
          error: "meetingId is required",
        },
        { status: 400 },
      );
    }

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: "userId is required",
        },
        { status: 400 },
      );
    }

    if (!transcripts || transcripts.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "At least one transcript is required",
        },
        { status: 400 },
      );
    }

    // Format transcripts for the prompt
    const formattedTranscripts = transcripts
      .map((t) => `[${t.participantName || "Unknown"}]: ${t.text}`)
      .join("\n");

    // Generate summary using Claude
    const claudeResponse = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,

      system: `
You are a meeting summarizer. Your job is to create a concise, actionable summary of the meeting transcript.

Focus on:
1. Key decisions made
2. Action items and next steps
3. Important insights or takeaways
4. Questions raised

Rules:
- Maximum 150 words
- Plain text only
- No markdown
- No bullet points
- Write in complete sentences
- Be specific and actionable
      `,

      messages: [
        {
          role: "user",
          content: `
Meeting: ${meetingTitle}

Transcript:
${formattedTranscripts}

Please provide a concise summary of this meeting.
`,
        },
      ],
    });

    const summaryText = claudeResponse.content?.[0]?.text || "";

    if (!summaryText) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to generate summary",
        },
        { status: 500 },
      );
    }

    // Save summary to database
    const savedSummary = await Summary.create({
      meetingId: meetingId,
      userId: userId,
      summary: summaryText,
      transcriptText: formattedTranscripts,
    });

    await Event.create({
      userId: userId,
      type: "summary.created",
      entityId: meetingId,
      title: "Summary Generated",
      description: `AI summary for "${meetingTitle}" is ready`,
      priority: "normal",
      icon: "Sparkles",
      color: "magenta",
      actionLink: `/dashboard/meetings`,
    });

    // Best-effort: derive skill scores / win-journal entry from this transcript
    // so the dashboard's "Skill trajectory" and "Win journal" widgets have real
    // data. Never blocks or fails the summary response.
    try {
      const conversationLog = transcripts
        .filter((t) => t.text && t.text !== "[NO SPEECH DETECTED]")
        .map((t) => `${t.participantName || "Unknown"}: ${t.text}`)
        .join("\n");
      await recordCoachingSignals(userId, conversationLog);
    } catch (err) {
      console.error("COACHING SIGNALS WRITE ERROR:", err);
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          id: savedSummary._id,
          summary: savedSummary.summary,
          createdAt: savedSummary.createdAt,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error generating summary:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to generate summary",
      },
      { status: 500 },
    );
  }
}
