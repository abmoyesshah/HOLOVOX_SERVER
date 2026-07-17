// app/api/ai-assistant/transcribe-live/route.js
import { NextResponse } from "../../../../utils/next-response.js";
// import { createClient } from "@deepgram/sdk";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import connectDB from "../../../../lib/db.js";
import Transcript from "../../../../app/models/Transcript.js";
import LiveAssist from "../../../../app/models/LiveAssist.model.js";
import {
  buildAssistContext,
  buildContextPrompt,
  saveAssistMemory,
} from "../../../../lib/ai-assistant/context-builder.js";
import { resolveRequestUserId } from "../../../../lib/auth-user.js";

export const runtime = "nodejs";

const anthropic = new Anthropic({
  apiKey: process.env.CLOUDAPI,
});

function getSummaryType(summary) {
  const lowerSummary = summary.toLowerCase();

  if (lowerSummary.includes("question") || lowerSummary.includes("?")) {
    return "question";
  }

  if (lowerSummary.includes("action") || lowerSummary.includes("next step")) {
    return "action";
  }

  if (lowerSummary.includes("decision") || lowerSummary.includes("agreed")) {
    return "decision";
  }

  if (lowerSummary.includes("insight") || lowerSummary.includes("key point")) {
    return "insight";
  }

  return "general";
}

export async function POST(req) {
  try {
    await connectDB();

    const formData = await req.formData();

    const audio = formData.get("audio");
    const roomId = formData.get("roomId");
    const participantId = formData.get("participantId");
    const participantName = formData.get("participantName");
    const sessionIdInput = formData.get("sessionId");
    const candidateUserId = formData.get("userId");

    const userId = resolveRequestUserId(
      req,
      typeof candidateUserId === "string" ? candidateUserId : "",
    );
    const sessionId =
      typeof sessionIdInput === "string" && sessionIdInput.trim()
        ? sessionIdInput.trim()
        : `${typeof roomId === "string" && roomId.trim() ? roomId.trim() : "room"}:${userId || participantId || "anon"}`;

    if (!audio) {
      return NextResponse.json({ error: "No audio file" }, { status: 400 });
    }

    const detectedMimeType =
      typeof audio?.type === "string" ? audio.type : "";

    const buffer = Buffer.from(await audio.arrayBuffer());

    // const deepgram = createClient(process.env.DEEPGRAM_API);
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // const { result } = await deepgram.listen.prerecorded.transcribeFile(
    //   buffer,
    //   {
    //     model: "nova-2",
    //     smart_format: true,
    //     language: "en",
    //     ...(detectedMimeType ? { mimetype: detectedMimeType } : {}),
    //   },
    // );

    // const deepgramChannels = Array.isArray(result?.results?.channels)
    //   ? result.results.channels
    //   : [];

    // const deepgramAlternatives = Array.isArray(deepgramChannels[0]?.alternatives)
    //   ? deepgramChannels[0].alternatives
    //   : [];

    // const primaryAlternative = deepgramAlternatives[0] || null;

    // const deepgramDebug = {
    //   duration: result?.metadata?.duration ?? null,
    //   channels: deepgramChannels.length,
    //   alternativesCount: deepgramAlternatives.length,
    //   confidence:
    //     typeof primaryAlternative?.confidence === "number"
    //       ? primaryAlternative.confidence
    //       : null,
    //   wordsCount: Array.isArray(primaryAlternative?.words)
    //     ? primaryAlternative.words.length
    //     : 0,
    // };

    // const text =
    //   result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";


const audioFile = new File(
  [buffer],
  audio.name || "audio.webm",
  {
    type: detectedMimeType || "audio/webm",
  }
);

const transcription = await openai.audio.transcriptions.create({
  file: audioFile,
  model: "gpt-4o-transcribe", // or "whisper-1"
  language: "en",
});
console.log("sending audio to Openapi...");

const text = transcription.text || "";


    // Save transcript
    let saved = null;
    if (text) {
      saved = await Transcript.create({
        roomId,
        participantId,
        participantName,
        text: text,
      });
    }

    if (!text || text.trim() === "") {
      return NextResponse.json({
        success: true,
        text: "",
        saved,
        summary: "",
        sessionId,
        audioBytes: buffer.length,
        mimeType: detectedMimeType,
        transcription: {
  model: "gpt-4o-transcribe",
},
        // deepgram: deepgramDebug,
      });
    }

    const assistContext = await buildAssistContext({
      userId,
      roomId: typeof roomId === "string" ? roomId : "",
      sessionId,
      queryText: text,
    });

    // =====================================
    // HOLO ASSIST - Generate Summary
    // =====================================

    const claudeResponse = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 140,

      system: `
You are Holo Assist.

You are a real-time AI meeting assistant.

    Use this context to guide your response:
    ${buildContextPrompt(assistContext)}

Your job is to assist the host during the conversation.

Rules:
    - Maximum 20 words.
- Plain text only.
- No markdown.
- No bullet points.
- Never repeat the transcript.
    - Never explain your reasoning.
    - Output the single most useful coaching suggestion or response.
    - Priority enforcement:
      1) Start from questionnaire/profile to shape tone, goals, and coaching style.
      2) Use assistant persona for delivery style only.
      3) Use recent memory/summaries only to maintain continuity.
      4) Use brain evidence only when directly relevant to current input.
      5) Let the current transcript chunk decide the immediate coaching point.
    `,

      messages: [
        {
          role: "user",
          content: text,
        },
      ],
    });

    const summary = claudeResponse.content?.[0]?.text || "";

    // =====================================
    // SAVE SUMMARY TO DATABASE
    // =====================================

    let savedSummary = null;
    let summaryError = null;

    if (summary && summary.trim() !== "") {
      try {
        const summaryType = getSummaryType(summary);

        savedSummary = await LiveAssist.create({
          roomId: typeof roomId === "string" ? roomId : "",
          participantId: typeof participantId === "string" ? participantId : "",
          participantName:
            typeof participantName === "string" ? participantName : "Unknown",
          summary,
          type: summaryType,
          transcriptText: text,
          userId: userId || "",
          sessionId,
          wordCount: summary.split(/\s+/).filter(Boolean).length,
          createdAt: new Date(),
        });
      } catch (err) {
        summaryError = err.message;
        console.error("❌ Error saving summary:", err);
      }
    }

    await saveAssistMemory({
      userId,
      roomId: typeof roomId === "string" ? roomId : "",
      sessionId,
      role: "user",
      text,
    });

    await saveAssistMemory({
      userId,
      roomId: typeof roomId === "string" ? roomId : "",
      sessionId,
      role: "assistant",
      text: summary,
      sourceRefs: assistContext.retrievedChunks.map((item) => item.fileName),
    });

    // =====================================
    // RETURN RESPONSE
    // =====================================

    return NextResponse.json({
      success: true,
      text,
      saved,
      summary,
      type: savedSummary?.type || "general",
      card: savedSummary
        ? {
            id: savedSummary._id?.toString?.() || String(savedSummary._id),
            type: savedSummary.type,
            text: savedSummary.summary,
            timestamp: savedSummary.createdAt,
            sessionId: savedSummary.sessionId,
            participantName: savedSummary.participantName,
            participantId: savedSummary.participantId,
            wordCount: savedSummary.wordCount,
          }
        : null,
      sessionId,
      audioBytes: buffer.length,
      retrieved: assistContext.retrievedChunks.map((item) => ({
        fileName: item.fileName,
        score: item.score,
      })),
      savedSummary: savedSummary
        ? {
            id: savedSummary._id,
            type: savedSummary.type,
            wordCount: savedSummary.wordCount,
            createdAt: savedSummary.createdAt,
            sessionId: savedSummary.sessionId,
          }
        : null,
      summaryError: summaryError,
    });
  } catch (err) {
    if (err?.name === "AuthIdentityMismatch") {
      return NextResponse.json(
        { success: false, error: "Unauthorized user identity" },
        { status: 403 },
      );
    }

    console.error("TRANSCRIBE ERROR:", err);

    return NextResponse.json(
      {
        success: false,
        error: err.message,
      },
      {
        status: 500,
      },
    );
  }
}

// app/api/ai-assistant/transcribe-live/route.js
export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get("roomId");
    const queryUserId = searchParams.get("userId") || "";
    const userId = resolveRequestUserId(request, queryUserId);
    const limit = parseInt(searchParams.get("limit") || "50");

    if (!roomId && !userId) {
      return NextResponse.json(
        { error: "Either roomId or userId is required" },
        { status: 400 },
      );
    }

    let query = {};
    if (roomId) {
      query.roomId = roomId;
    }
    if (userId) {
      query.userId = userId;
    }

    const summaries = await LiveAssist.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Format for frontend
    const formattedSummaries = summaries.map((s) => ({
      id: s._id.toString(),
      text: s.summary,
      type: s.type || "general",
      timestamp: s.createdAt,
      participantName: s.participantName,
      participantId: s.participantId,
      wordCount: s.wordCount,
      sessionId: s.sessionId,
    }));

    return NextResponse.json({
      success: true,
      summaries: formattedSummaries,
      total: summaries.length,
      roomId,
    });
  } catch (error) {
    if (error?.name === "AuthIdentityMismatch") {
      return NextResponse.json(
        { success: false, error: "Unauthorized user identity" },
        { status: 403 },
      );
    }

    console.error("❌ GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}