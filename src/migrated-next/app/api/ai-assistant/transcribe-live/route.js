// app/api/ai-assistant/transcribe-live/route.js
import { NextResponse } from "../../../../utils/next-response.js";
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
import { syncEnterpriseTranscript } from "../../../../../services/enterprise/enterpriseMeetingSync.service.js";

export const runtime = "nodejs";

const anthropic = new Anthropic({
  apiKey: process.env.CLOUDAPI,
});

// Initialize OpenAI with proper error handling
let openai;
try {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY is not set in environment variables');
    throw new Error('OPENAI_API_KEY is required for transcription');
  }

  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY.trim(),
  });
  console.log('✅ OpenAI client initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize OpenAI:', error.message);
}

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

    // Check if OpenAI is initialized
    if (!openai) {
      console.error('❌ OpenAI client not initialized');
      return NextResponse.json(
        { error: "OpenAI client not initialized. Please check OPENAI_API_KEY environment variable." },
        { status: 500 }
      );
    }

    const formData = await req.formData();

    // ✅ FIXED: Safely log FormData without using entries()
    console.log('📥 [BACKEND] Received FormData:');

    // Get all fields individually
    const audio = formData.get("audio");
    const roomId = formData.get("roomId");
    const participantId = formData.get("participantId");
    const participantName = formData.get("participantName");
    const sessionIdInput = formData.get("sessionId");
    const candidateUserId = formData.get("userId");

    // Log each field
    console.log(`  audio: ${audio ? `File(${audio.size} bytes, ${audio.type})` : 'null'}`);
    console.log(`  roomId: ${roomId || 'null'}`);
    console.log(`  participantId: ${participantId || 'null'}`);
    console.log(`  participantName: ${participantName || 'null'}`);
    console.log(`  sessionIdInput: ${sessionIdInput || 'null'}`);
    console.log(`  candidateUserId: ${candidateUserId || 'null'}`);

    // Resolve userId with fallbacks
    let userId = resolveRequestUserId(
      req,
      typeof candidateUserId === "string" ? candidateUserId : "",
    );

    // ✅ If userId is empty, use participantId
    if (!userId && participantId) {
      console.log('⚠️ [BACKEND] userId empty, using participantId:', participantId);
      userId = participantId;
    }

    // ✅ If still empty, use a default
    if (!userId) {
      console.log('⚠️ [BACKEND] No userId found, using default');
      userId = 'anonymous_user';
    }

    console.log(`✅ [BACKEND] Final userId: ${userId}`);

    const sessionId =
      typeof sessionIdInput === "string" && sessionIdInput.trim()
        ? sessionIdInput.trim()
        : `${typeof roomId === "string" && roomId.trim() ? roomId.trim() : "room"}:${userId || participantId || "anon"}`;

    console.log(`📋 [BACKEND] Session ID: ${sessionId}`);

    if (!audio) {
      return NextResponse.json({ error: "No audio file" }, { status: 400 });
    }

    const detectedMimeType =
      typeof audio?.type === "string" ? audio.type : "";

    const buffer = Buffer.from(await audio.arrayBuffer());

    // =============================================
    // TRANSCRIBE WITH OPENAI
    // =============================================

    const audioFile = new File(
      [buffer],
      audio.name || "audio.webm",
      {
        type: detectedMimeType || "audio/webm",
      }
    );

    console.log('🎤 [BACKEND] Sending audio to OpenAI for transcription...');
    console.log(`  Audio size: ${buffer.length} bytes`);
    console.log(`  Audio type: ${detectedMimeType || 'audio/webm'}`);

    let text = "";
    try {
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "gpt-4o-transcribe",
        language: "en",
      });

      text = transcription.text || "";
      console.log(`✅ [BACKEND] Transcription successful: "${text.slice(0, 100)}..."`);
    } catch (transcriptionError) {
      console.error('❌ [BACKEND] Transcription failed:', transcriptionError.message);
      return NextResponse.json(
        { error: `Transcription failed: ${transcriptionError.message}` },
        { status: 500 }
      );
    }

    // Save transcript
    let saved = null;
    if (text && text.length > 10) {
      saved = await Transcript.create({
        roomId,
        participantId,
        participantName,
        text: text,
      });
      syncEnterpriseTranscript({
        roomId,
        participantId,
        participantName,
        text,
        normalTranscriptId: saved._id,
      }).catch((error) =>
        console.error("Enterprise transcript sync failed:", error.message),
      );
    }

    if (!text || text.trim() === "" || text.length < 10) {
      console.log("text irrelevant: ", text);
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
      });
    }

    // =============================================
    // BUILD CONTEXT
    // =============================================

    console.log(`🔨 [BACKEND] Building context for userId: ${userId}`);

    const assistContext = await buildAssistContext({
      userId: userId,
      roomId: typeof roomId === "string" ? roomId : "",
      sessionId,
      queryText: text,
    });

    const contextPrompt = buildContextPrompt(assistContext);
    // const contextPrompt = 'BAWDICSOFT   COMPANY & SERVICES OVERVIEW bawdicsoft.com Company Overview Bawdicsoft is a software development agency founded in 2018, based in Karachi, Pakistan, with a team of approximately 22 employees. The company also operates as a registered Wyoming LLC to serve US-based clients directly. Core Services Web Application Development Custom web applications built end to end, from architecture through deployment. Blockchain & Web3 Solutions Development of blockchain-based platforms and Web3 applications. AI Services AI integration and product development for clients building AI-powered platforms. Track Record 250+ projects delivered across 15+ countries since founding. Certifications ISO 27001 certified.'
    // =============================================
    // GENERATE SUMMARY WITH CLAUDE
    // =============================================

    console.log('🤖 [BACKEND] Generating summary with Claude...');

    let summary = "";
    try {
      const claudeResponse = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 140,

        // system: `
        //     You are Holo Assist.

        //     You are a real-time AI meeting assistant.

        //         Use this context to guide your response:
        //         ${contextPrompt}

        //     Your job is to assist the host during the conversation.

        //     Rules:
        //         - Maximum 20 words.
        //     - Plain text only.
        //     - No markdown.
        //     - No bullet points.
        //     - Never repeat the transcript.
        //         - Never explain your reasoning.
        //         - Output the single most useful coaching suggestion or response.
        //         - Priority enforcement:
        //           1) Start from questionnaire/profile to shape tone, goals, and coaching style.
        //           2) Use recent memory/summaries only to maintain continuity.
        //           3) Use brain evidence only when directly relevant to current input.
        //           4) Let the current transcript chunk decide the immediate coaching point.
        //         `,

        system: `
        You are Holo Assist — the real-time AI coaching engine inside HOLOVOX, 
        the world's first meeting platform with a live in-meeting AI coach. You are listening to this meeting continuously. 
        Every message you receive is the newest chunk of live transcript. 
        Your job is to give the host one sharp, real-time coaching line: what to say, ask, avoid, or do next — based on what is actually being said right now.
        
        CONTEXT PROVIDED FOR THIS TURN:
        ${contextPrompt}
        
        HOW TO USE THE CONTEXT ABOVE — READ CAREFULLY:
        The context block above will be in one of three states. Identify which one applies before responding:
        1. If it says "RELEVANT KNOWLEDGE FOUND" — the user has profile data and/or brain knowledge relevant to this exact moment. Ground your coaching line in it: match their tone, respect their goals and their "never do" list, and use the retrieved knowledge as fact. Do not contradict it.
        2. If it says "GENERAL QUERY DETECTED" — this transcript chunk is small talk, a greeting, or has no business substance. Respond naturally and briefly using the profile for tone only; do not force in knowledge that isn't relevant here.
        3. If it says "NO RELEVANT KNOWLEDGE" or the profile is "Not available" — there is no usable context for this user yet. In this case you must still coach: listen to the current transcript chunk and recent meeting context, and give the best real-time coaching an experienced, sharp meeting advisor would give with zero prior background on these people. Never say you lack context — just coach from what's being said.
        
        In every case, the current transcript chunk is what decides the actual content of your suggestion. Context (profile, memory, knowledge) only shapes HOW you say it — tone, goals, phrasing style — never a substitute for reacting to what's actually happening in the conversation right now.
        PRIORITY ORDER when context is available:
        1. Target user's profile — tone, goals, communication style, things to never say.
        2. Session memory — for continuity; never repeat a suggestion already given.
        3. Brain knowledge (personal + enterprise) — used only when directly relevant to the current line of conversation.
        4. The current transcript chunk — this always drives the actual content of the coaching line.

        OUTPUT RULES:
        - Maximum 20 words.
        - Plain text only — no markdown, no bullets, no labels like "Suggestion:".
        - Never repeat, quote, or paraphrase the transcript back to the user.
        - Never explain your reasoning or mention "context," "profile," "knowledge base," or "transcript."
        - Never produce generic filler like "I'm ready to assist" or "let me know if you need help."
        - If there is genuinely nothing useful to say yet, respond with nothing rather than filler.
        - One clear, concrete, actionable line — no hedging, no "you could consider."
        `,

        messages: [
          {
            role: "user",
            content: text,
          },
        ],
      });

      summary = claudeResponse.content?.[0]?.text || "";
      console.log(`✅ [BACKEND] Summary generated: "${summary.slice(0, 50)}..."`);
    } catch (claudeError) {
      console.error('❌ [BACKEND] Claude summary generation failed:', claudeError.message);
      // Continue without summary
    }

    // =============================================
    // SAVE TO DATABASE
    // =============================================

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
        console.log(`✅ [BACKEND] Summary saved (ID: ${savedSummary._id})`);
      } catch (err) {
        summaryError = err.message;
        console.error("❌ [BACKEND] Error saving summary:", err);
      }
    }

    // Save memory with proper userId
    console.log(`💾 [BACKEND] Saving memory for userId: ${userId}`);

    await saveAssistMemory({
      userId: userId,
      roomId: typeof roomId === "string" ? roomId : "",
      sessionId,
      role: "user",
      text,
    });

    await saveAssistMemory({
      userId: userId,
      roomId: typeof roomId === "string" ? roomId : "",
      sessionId,
      role: "assistant",
      text: summary,
      sourceRefs: assistContext.retrievedChunks?.map((item) => item.fileName) || [],
    });

    // =============================================
    // RETURN RESPONSE
    // =============================================

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
      retrieved: assistContext.retrievedChunks?.map((item) => ({
        fileName: item.fileName,
        score: item.score,
      })) || [],
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

    console.error("❌ [BACKEND] TRANSCRIBE ERROR:", err);
    console.error(err.stack);

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

// =============================================
// GET HANDLER
// =============================================

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

    console.error("❌ [BACKEND] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}