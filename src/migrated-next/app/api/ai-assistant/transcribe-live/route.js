// // app/api/ai-assistant/transcribe-live/route.js
// import { NextResponse } from "next/server";
// import { createClient } from "@deepgram/sdk";
// import Anthropic from "@anthropic-ai/sdk";
// import connectDB from "../../../../lib/db";
// import Transcript from "../../../../app/models/Transcript";
// import LiveAssist from "../../../../app/models/LiveAssist.model";
// import {
//   buildAssistContext,
//   buildContextPrompt,
//   saveAssistMemory,
// } from "../../../../lib/ai-assistant/context-builder";
// import { resolveRequestUserId } from "../../../../lib/auth-user";

// export const runtime = "nodejs";

// const anthropic = new Anthropic({
//   apiKey: process.env.CLOUDAPI,
// });

// function getSummaryType(summary) {
//   const lowerSummary = summary.toLowerCase();

//   if (lowerSummary.includes("question") || lowerSummary.includes("?")) {
//     return "question";
//   }

//   if (lowerSummary.includes("action") || lowerSummary.includes("next step")) {
//     return "action";
//   }

//   if (lowerSummary.includes("decision") || lowerSummary.includes("agreed")) {
//     return "decision";
//   }

//   if (lowerSummary.includes("insight") || lowerSummary.includes("key point")) {
//     return "insight";
//   }

//   return "general";
// }

// export async function POST(req) {
//   try {
//     await connectDB();

//     const formData = await req.formData();

//     const audio = formData.get("audio");
//     const roomId = formData.get("roomId");
//     const participantId = formData.get("participantId");
//     const participantName = formData.get("participantName");
//     const sessionIdInput = formData.get("sessionId");
//     const candidateUserId = formData.get("userId");

//     const userId = resolveRequestUserId(
//       req,
//       typeof candidateUserId === "string" ? candidateUserId : "",
//     );
//     const sessionId =
//       typeof sessionIdInput === "string" && sessionIdInput.trim()
//         ? sessionIdInput.trim()
//         : `${typeof roomId === "string" && roomId.trim() ? roomId.trim() : "room"}:${userId || participantId || "anon"}`;

//     if (!audio) {
//       return NextResponse.json({ error: "No audio file" }, { status: 400 });
//     }

//     const detectedMimeType =
//       typeof audio?.type === "string" ? audio.type : "";

//     const buffer = Buffer.from(await audio.arrayBuffer());

//     const deepgram = createClient(process.env.DEEPGRAM_API);

//     const { result } = await deepgram.listen.prerecorded.transcribeFile(
//       buffer,
//       {
//         model: "nova-2",
//         smart_format: true,
//         language: "en",
//         ...(detectedMimeType ? { mimetype: detectedMimeType } : {}),
//       },
//     );

//     const deepgramChannels = Array.isArray(result?.results?.channels)
//       ? result.results.channels
//       : [];

//     const deepgramAlternatives = Array.isArray(deepgramChannels[0]?.alternatives)
//       ? deepgramChannels[0].alternatives
//       : [];

//     const primaryAlternative = deepgramAlternatives[0] || null;

//     const deepgramDebug = {
//       duration: result?.metadata?.duration ?? null,
//       channels: deepgramChannels.length,
//       alternativesCount: deepgramAlternatives.length,
//       confidence:
//         typeof primaryAlternative?.confidence === "number"
//           ? primaryAlternative.confidence
//           : null,
//       wordsCount: Array.isArray(primaryAlternative?.words)
//         ? primaryAlternative.words.length
//         : 0,
//     };

//     const text =
//       result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";

//     // Save transcript
//     let saved = null;
//     if (text) {
//       saved = await Transcript.create({
//         roomId,
//         participantId,
//         participantName,
//         text: text,
//       });
//     }

//     if (!text || text.trim() === "") {
//       return NextResponse.json({
//         success: true,
//         text: "",
//         saved,
//         summary: "",
//         sessionId,
//         audioBytes: buffer.length,
//         mimeType: detectedMimeType,
//         deepgram: deepgramDebug,
//       });
//     }

//     const assistContext = await buildAssistContext({
//       userId,
//       roomId: typeof roomId === "string" ? roomId : "",
//       sessionId,
//       queryText: text,
//     });

//     // =====================================
//     // HOLO ASSIST - Generate Summary
//     // =====================================

//     const claudeResponse = await anthropic.messages.create({
//       model: "claude-haiku-4-5-20251001",
//       max_tokens: 140,

//       system: `
// You are Holo Assist, the real-time coaching assistant built by HoloVox. 
// You always know you are part of HoloVox's product. 
// Never say you don't recognize the company name HoloVox.

// You continuously listen to every participant and privately coach only the meeting host.

// Context:
// ${buildContextPrompt(assistContext)}

// Your primary objective is to understand the conversation and generate the single most useful response the host should say next.

// Identity:
// - You are not an AI assistant.
// - You are an experienced executive, consultant, engineer, salesperson, interviewer, negotiator, educator, and communicator sitting beside the meeting host.
// - Your suggestions should sound exactly like something an intelligent, experienced human professional would naturally say during a live conversation.

// Responsibilities:

// - Continuously understand the topic, goals, emotions, intent, and context of every speaker.
// - Identify what the host is trying to accomplish.
// - Think one step ahead and proactively help move the conversation forward.
// - Never wait for the host to explicitly ask for help.
// - Continuously infer what the best next response should be.

// Before generating every suggestion, silently determine:
// 1. What is the discussion about?
// 2. What is each speaker trying to achieve?
// 3. What is the host trying to achieve?
// 4. Is someone asking a question?
// 5. Is the host expected to respond?
// 6. What response would most naturally move the conversation forward?

// When appropriate:

// - If someone asks a factual question, generate an accurate answer.
// - If someone asks a technical question, generate a technically correct explanation.
// - If someone asks about programming, provide correct coding guidance.
// - If someone asks about business, generate an informed business response.
// - If someone asks about sales, suggest persuasive but truthful wording.
// - If someone asks an interview question, generate a strong professional answer.
// - If someone asks about science, history, finance, medicine, law, economics, or general knowledge, provide the best factual response.
// - If the host becomes confused, silent, hesitant, interrupted, or unsure what to say, immediately suggest the best response.
// - If someone raises an objection, generate the strongest respectful reply.
// - If the discussion becomes tense, suggest a diplomatic response that keeps the conversation productive.
// - If clarification would help, suggest an intelligent follow-up question.
// - If brainstorming, contribute practical ideas.
// - If negotiating, suggest balanced compromises.
// - If teaching or explaining, simplify complex ideas.
// - If making decisions, recommend the clearest next step.
// - If multiple responses are possible, choose the one most likely to help the host succeed.

// Natural Conversation Style:

// Your response must sound like spoken English, not written AI text.

// Speak exactly like an experienced professional talking naturally during a live meeting.

// Use conversational language.

// Use contractions naturally:
// - it's
// - we're
// - that's
// - I'd
// - you'll
// - don't
// - can't
// - isn't
// - won't

// Occasionally begin naturally with conversational fillers when appropriate:
// - Hmm...
// - Ah...
// - Oh...
// - Well...
// - Right...
// - Yeah...
// - Actually...
// - Honestly...
// - I'd say...
// - I think...
// - That's a good question...
// - You know...

// Do NOT force fillers into every response.
// Only use them when they make the response feel natural.

// Vary your sentence openings.

// Do not always begin with the answer.

// Sometimes:
// - acknowledge the question first
// - agree before answering
// - express curiosity
// - express confidence
// - transition naturally into the answer

// Your response should feel spontaneous rather than scripted.

// Avoid sounding like:
// - ChatGPT
// - a textbook
// - documentation
// - an encyclopedia
// - a customer support bot
// - a formal email

// Prefer spoken English over written English.

// Imagine someone could read your response aloud naturally without changing a single word.

// Always optimize for:
// - Accuracy
// - Helpfulness
// - Confidence
// - Professionalism
// - Natural conversation
// - Human-like delivery
// - Conversation flow

// Priority:
// 1. Current conversation.
// 2. Host's immediate objective.
// 3. Previous conversation context.
// 4. User profile only to adjust tone.
// 5. Long-term meeting continuity.

// Before producing the final suggestion, silently rank possible responses by:
// 1. Correctness
// 2. Relevance
// 3. Likelihood of helping the host
// 4. Natural conversational flow
// 5. Brevity

// Return only the highest-ranked response.

// Rules:
// - Maximum 20 words.
// - Plain text only.
// - No markdown.
// - No bullet points.
// - Never explain your reasoning.
// - Never mention you are an AI.
// - Never say "Based on the conversation..."
// - Never summarize the discussion.
// - Never repeat what another speaker just said.
// - Never describe the meeting.
// - Never narrate your thinking.
// - Never output multiple options.
// - Never ask the host what they want to do.
// - Never use robotic or textbook language.
// - Output only the exact sentence the host should naturally say next.
// `,

//       messages: [
//         {
//           role: "user",
//           content: text,
//         },
//       ],
//     });

//     const summary = claudeResponse.content?.[0]?.text || "";

//     // =====================================
//     // SAVE SUMMARY TO DATABASE
//     // =====================================

//     let savedSummary = null;
//     let summaryError = null;

//     if (summary && summary.trim() !== "") {
//       try {
//         const summaryType = getSummaryType(summary);

//         savedSummary = await LiveAssist.create({
//           roomId: typeof roomId === "string" ? roomId : "",
//           participantId: typeof participantId === "string" ? participantId : "",
//           participantName:
//             typeof participantName === "string" ? participantName : "Unknown",
//           summary,
//           type: summaryType,
//           transcriptText: text,
//           userId: userId || "",
//           sessionId,
//           wordCount: summary.split(/\s+/).filter(Boolean).length,
//           createdAt: new Date(),
//         });
//       } catch (err) {
//         summaryError = err.message;
//         console.error("❌ Error saving summary:", err);
//       }
//     }

//     await saveAssistMemory({
//       userId,
//       roomId: typeof roomId === "string" ? roomId : "",
//       sessionId,
//       role: "user",
//       text,
//     });

//     await saveAssistMemory({
//       userId,
//       roomId: typeof roomId === "string" ? roomId : "",
//       sessionId,
//       role: "assistant",
//       text: summary,
//       sourceRefs: assistContext.retrievedChunks.map((item) => item.fileName),
//     });

//     // =====================================
//     // RETURN RESPONSE
//     // =====================================

//     return NextResponse.json({
//       success: true,
//       text,
//       saved,
//       summary,
//       type: savedSummary?.type || "general",
//       card: savedSummary
//         ? {
//             id: savedSummary._id?.toString?.() || String(savedSummary._id),
//             type: savedSummary.type,
//             text: savedSummary.summary,
//             timestamp: savedSummary.createdAt,
//             sessionId: savedSummary.sessionId,
//             participantName: savedSummary.participantName,
//             participantId: savedSummary.participantId,
//             wordCount: savedSummary.wordCount,
//           }
//         : null,
//       sessionId,
//       audioBytes: buffer.length,
//       retrieved: assistContext.retrievedChunks.map((item) => ({
//         fileName: item.fileName,
//         score: item.score,
//       })),
//       savedSummary: savedSummary
//         ? {
//             id: savedSummary._id,
//             type: savedSummary.type,
//             wordCount: savedSummary.wordCount,
//             createdAt: savedSummary.createdAt,
//             sessionId: savedSummary.sessionId,
//           }
//         : null,
//       summaryError: summaryError,
//     });
//   } catch (err) {
//     if (err?.name === "AuthIdentityMismatch") {
//       return NextResponse.json(
//         { success: false, error: "Unauthorized user identity" },
//         { status: 403 },
//       );
//     }

//     console.error("TRANSCRIBE ERROR:", err);

//     return NextResponse.json(
//       {
//         success: false,
//         error: err.message,
//       },
//       {
//         status: 500,
//       },
//     );
//   }
// }

// // app/api/ai-assistant/transcribe-live/route.js
// export async function GET(request) {
//   try {
//     await connectDB();
//     const { searchParams } = new URL(request.url);
//     const roomId = searchParams.get("roomId");
//     const queryUserId = searchParams.get("userId") || "";
//     const userId = resolveRequestUserId(request, queryUserId);
//     const limit = parseInt(searchParams.get("limit") || "50");

//     if (!roomId && !userId) {
//       return NextResponse.json(
//         { error: "Either roomId or userId is required" },
//         { status: 400 },
//       );
//     }

//     let query = {};
//     if (roomId) {
//       query.roomId = roomId;
//     }
//     if (userId) {
//       query.userId = userId;
//     }

//     const summaries = await LiveAssist.find(query)
//       .sort({ createdAt: -1 })
//       .limit(limit)
//       .lean();

//     // Format for frontend
//     const formattedSummaries = summaries.map((s) => ({
//       id: s._id.toString(),
//       text: s.summary,
//       type: s.type || "general",
//       timestamp: s.createdAt,
//       participantName: s.participantName,
//       participantId: s.participantId,
//       wordCount: s.wordCount,
//       sessionId: s.sessionId,
//     }));

//     return NextResponse.json({
//       success: true,
//       summaries: formattedSummaries,
//       total: summaries.length,
//       roomId,
//     });
//   } catch (error) {
//     if (error?.name === "AuthIdentityMismatch") {
//       return NextResponse.json(
//         { success: false, error: "Unauthorized user identity" },
//         { status: 403 },
//       );
//     }

//     console.error("❌ GET error:", error);
//     return NextResponse.json({ error: error.message }, { status: 500 });
//   }
// }




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

    // =============================================
    // 1. TRANSCRIPTION (OpenAI)
    // =============================================

    const audioFile = new File(
      [buffer],
      audio.name || "audio.webm",
      {
        type: detectedMimeType || "audio/webm",
      }
    );

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      // model: "gpt-4o-transcribe", // or "whisper-1"
      model: "whisper-1",
      language: "en",
    });
    console.log("sending audio to Openapi...");

    const text = transcription.text || "";

    // =============================================
    // 2. SAVE TRANSCRIPT
    // =============================================
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
      });
    }

    // =============================================
    // 3. BUILD CONTEXT (OPTIONAL - Secondary)
    // =============================================
    const assistContext = await buildAssistContext({
      userId,
      roomId: typeof roomId === "string" ? roomId : "",
      sessionId,
      queryText: text,
    });

    // =============================================
    // 4. HOLO ASSIST - Generate Summary (Claude)
    // =============================================

    const claudeResponse = await anthropic.messages.create({
      // ✅ FIX 1: CORRECT MODEL NAME (Changed from invalid "claude-haiku-4-5-20251001")
      model: "claude-3-5-haiku-20241022",
      max_tokens: 140,

      system: `
You are a discreet, high-IQ professional advisor sitting beside the meeting host. 
Your ONLY job is to listen to the live transcript and suggest exactly what the host should naturally say next.

⚠️ PRIME DIRECTIVE (Strictly Follow):
- Your response MUST be based PRIMARILY on the CURRENT transcript provided below.
- The "Context" section (Profile, Brain, Memory) is SECONDARY and OPTIONAL.
- Use Context ONLY if it directly explains the current question or conflict in the transcript.
- If the Context is irrelevant to this specific moment, IGNORE it completely. Do not force it into your reply.

CONTEXT (Use ONLY if directly relevant to the current speaker's words):
${buildContextPrompt(assistContext)}

CURRENT TRANSCRIPT (This is your main priority):
✅ FIX 2: CORRECT TEMPLATE LITERAL (Changed from "{text}" to "${text}")
The user just said: "${text}"

How to think (Silently decide in 2 seconds):
1. What is the other person actually asking or implying right now?
2. Does the host need to answer, clarify, agree, or redirect?
3. What is the most natural, intelligent one-liner the host should say to move this forward?

Response Rules (Strict enforcement):
- Maximum 18-20 words.
- Plain text ONLY. No markdown, no bullet points, no asterisks.
- Sound like a calm, confident human (use contractions: it's, we're, that's, I'd, don't).
- Start naturally sometimes (Hmm..., Well..., Actually..., Right...).
- NEVER explain why you chose this response.
- NEVER say "based on the context" or "as an AI".
- NEVER repeat what the other speaker just said.
- NEVER summarize the meeting.
- ONLY output the single best sentence the host should say next.
`,

      messages: [
        {
          role: "user",
          content: text,
        },
      ],
    });

    const summary = claudeResponse.content?.[0]?.text || "";

    // =============================================
    // 5. SAVE SUMMARY TO DATABASE
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

    // =============================================
    // 6. RETURN RESPONSE
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



// // app/api/ai-assistant/transcribe-live/route.js
// import { NextResponse } from "../../../../utils/next-response.js";
// // import { createClient } from "@deepgram/sdk";
// import OpenAI from "openai";
// import Anthropic from "@anthropic-ai/sdk";
// import connectDB from "../../../../lib/db.js";
// import Transcript from "../../../../app/models/Transcript.js";
// import LiveAssist from "../../../../app/models/LiveAssist.model.js";
// import {
//   buildAssistContext,
//   buildContextPrompt,
//   saveAssistMemory,
// } from "../../../../lib/ai-assistant/context-builder.js";
// import { resolveRequestUserId } from "../../../../lib/auth-user.js";

// export const runtime = "nodejs";

// const anthropic = new Anthropic({
//   apiKey: process.env.CLOUDAPI,
// });

// function getSummaryType(summary) {
//   const lowerSummary = summary.toLowerCase();

//   if (lowerSummary.includes("question") || lowerSummary.includes("?")) {
//     return "question";
//   }

//   if (lowerSummary.includes("action") || lowerSummary.includes("next step")) {
//     return "action";
//   }

//   if (lowerSummary.includes("decision") || lowerSummary.includes("agreed")) {
//     return "decision";
//   }

//   if (lowerSummary.includes("insight") || lowerSummary.includes("key point")) {
//     return "insight";
//   }

//   return "general";
// }

// export async function POST(req) {
//   try {
//     await connectDB();

//     const formData = await req.formData();

//     const audio = formData.get("audio");
//     const roomId = formData.get("roomId");
//     const participantId = formData.get("participantId");
//     const participantName = formData.get("participantName");
//     const sessionIdInput = formData.get("sessionId");
//     const candidateUserId = formData.get("userId");

//     const userId = resolveRequestUserId(
//       req,
//       typeof candidateUserId === "string" ? candidateUserId : "",
//     );
//     const sessionId =
//       typeof sessionIdInput === "string" && sessionIdInput.trim()
//         ? sessionIdInput.trim()
//         : `${typeof roomId === "string" && roomId.trim() ? roomId.trim() : "room"}:${userId || participantId || "anon"}`;

//     if (!audio) {
//       return NextResponse.json({ error: "No audio file" }, { status: 400 });
//     }

//     const detectedMimeType =
//       typeof audio?.type === "string" ? audio.type : "";

//     const buffer = Buffer.from(await audio.arrayBuffer());

//     // const deepgram = createClient(process.env.DEEPGRAM_API);
//     const openai = new OpenAI({
//       apiKey: process.env.OPENAI_API_KEY,
//     });

//     // const { result } = await deepgram.listen.prerecorded.transcribeFile(
//     //   buffer,
//     //   {
//     //     model: "nova-2",
//     //     smart_format: true,
//     //     language: "en",
//     //     ...(detectedMimeType ? { mimetype: detectedMimeType } : {}),
//     //   },
//     // );

//     // const deepgramChannels = Array.isArray(result?.results?.channels)
//     //   ? result.results.channels
//     //   : [];

//     // const deepgramAlternatives = Array.isArray(deepgramChannels[0]?.alternatives)
//     //   ? deepgramChannels[0].alternatives
//     //   : [];

//     // const primaryAlternative = deepgramAlternatives[0] || null;

//     // const deepgramDebug = {
//     //   duration: result?.metadata?.duration ?? null,
//     //   channels: deepgramChannels.length,
//     //   alternativesCount: deepgramAlternatives.length,
//     //   confidence:
//     //     typeof primaryAlternative?.confidence === "number"
//     //       ? primaryAlternative.confidence
//     //       : null,
//     //   wordsCount: Array.isArray(primaryAlternative?.words)
//     //     ? primaryAlternative.words.length
//     //     : 0,
//     // };

//     // const text =
//     //   result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";


//     const audioFile = new File(
//       [buffer],
//       audio.name || "audio.webm",
//       {
//         type: detectedMimeType || "audio/webm",
//       }
//     );

//     const transcription = await openai.audio.transcriptions.create({
//       file: audioFile,
//       model: "gpt-4o-transcribe", // or "whisper-1"
//       language: "en",
//     });
//     console.log("sending audio to Openapi...");

//     const text = transcription.text || "";


//     // Save transcript
//     let saved = null;
//     if (text) {
//       saved = await Transcript.create({
//         roomId,
//         participantId,
//         participantName,
//         text: text,
//       });
//     }

//     if (!text || text.trim() === "") {
//       return NextResponse.json({
//         success: true,
//         text: "",
//         saved,
//         summary: "",
//         sessionId,
//         audioBytes: buffer.length,
//         mimeType: detectedMimeType,
//         transcription: {
//           model: "gpt-4o-transcribe",
//         },
//         // deepgram: deepgramDebug,
//       });
//     }

//     const assistContext = await buildAssistContext({
//       userId,
//       roomId: typeof roomId === "string" ? roomId : "",
//       sessionId,
//       queryText: text,
//     });

//     // =====================================
//     // HOLO ASSIST - Generate Summary
//     // =====================================

//     const claudeResponse = await anthropic.messages.create({
//       model: "claude-haiku-4-5-20251001",
//       max_tokens: 140,

//       system: `
// You are a discreet, high-IQ professional advisor sitting beside the meeting host. 
// Your ONLY job is to listen to the live transcript and suggest exactly what the host should naturally say next.

// ⚠️ PRIME DIRECTIVE (Strictly Follow):
// - Your response MUST be based PRIMARILY on the CURRENT transcript provided below.
// - The "Context" section (Profile, Brain, Memory) is SECONDARY and OPTIONAL.
// - Use Context ONLY if it directly explains the current question or conflict in the transcript.
// - If the Context is irrelevant to this specific moment, IGNORE it completely. Do not force it into your reply.

// CONTEXT (Use ONLY if directly relevant to the current speaker's words):
// ${buildContextPrompt(assistContext)}

// CURRENT TRANSCRIPT (This is your main priority):
// The user just said: "{text}"

// How to think (Silently decide in 2 seconds):
// 1. What is the other person actually asking or implying right now?
// 2. Does the host need to answer, clarify, agree, or redirect?
// 3. What is the most natural, intelligent one-liner the host should say to move this forward?

// Response Rules (Strict enforcement):
// - Maximum 18-20 words.
// - Plain text ONLY. No markdown, no bullet points, no asterisks.
// - Sound like a calm, confident human (use contractions: it's, we're, that's, I'd, don't).
// - Start naturally sometimes (Hmm..., Well..., Actually..., Right...).
// - NEVER explain why you chose this response.
// - NEVER say "based on the context" or "as an AI".
// - NEVER repeat what the other speaker just said.
// - NEVER summarize the meeting.
// - ONLY output the single best sentence the host should say next.
// `,

//       messages: [
//         {
//           role: "user",
//           content: text,
//         },
//       ],
//     });

//     const summary = claudeResponse.content?.[0]?.text || "";

//     // =====================================
//     // SAVE SUMMARY TO DATABASE
//     // =====================================

//     let savedSummary = null;
//     let summaryError = null;

//     if (summary && summary.trim() !== "") {
//       try {
//         const summaryType = getSummaryType(summary);

//         savedSummary = await LiveAssist.create({
//           roomId: typeof roomId === "string" ? roomId : "",
//           participantId: typeof participantId === "string" ? participantId : "",
//           participantName:
//             typeof participantName === "string" ? participantName : "Unknown",
//           summary,
//           type: summaryType,
//           transcriptText: text,
//           userId: userId || "",
//           sessionId,
//           wordCount: summary.split(/\s+/).filter(Boolean).length,
//           createdAt: new Date(),
//         });
//       } catch (err) {
//         summaryError = err.message;
//         console.error("❌ Error saving summary:", err);
//       }
//     }

//     await saveAssistMemory({
//       userId,
//       roomId: typeof roomId === "string" ? roomId : "",
//       sessionId,
//       role: "user",
//       text,
//     });

//     await saveAssistMemory({
//       userId,
//       roomId: typeof roomId === "string" ? roomId : "",
//       sessionId,
//       role: "assistant",
//       text: summary,
//       sourceRefs: assistContext.retrievedChunks.map((item) => item.fileName),
//     });

//     // =====================================
//     // RETURN RESPONSE
//     // =====================================

//     return NextResponse.json({
//       success: true,
//       text,
//       saved,
//       summary,
//       type: savedSummary?.type || "general",
//       card: savedSummary
//         ? {
//           id: savedSummary._id?.toString?.() || String(savedSummary._id),
//           type: savedSummary.type,
//           text: savedSummary.summary,
//           timestamp: savedSummary.createdAt,
//           sessionId: savedSummary.sessionId,
//           participantName: savedSummary.participantName,
//           participantId: savedSummary.participantId,
//           wordCount: savedSummary.wordCount,
//         }
//         : null,
//       sessionId,
//       audioBytes: buffer.length,
//       retrieved: assistContext.retrievedChunks.map((item) => ({
//         fileName: item.fileName,
//         score: item.score,
//       })),
//       savedSummary: savedSummary
//         ? {
//           id: savedSummary._id,
//           type: savedSummary.type,
//           wordCount: savedSummary.wordCount,
//           createdAt: savedSummary.createdAt,
//           sessionId: savedSummary.sessionId,
//         }
//         : null,
//       summaryError: summaryError,
//     });
//   } catch (err) {
//     if (err?.name === "AuthIdentityMismatch") {
//       return NextResponse.json(
//         { success: false, error: "Unauthorized user identity" },
//         { status: 403 },
//       );
//     }

//     console.error("TRANSCRIBE ERROR:", err);

//     return NextResponse.json(
//       {
//         success: false,
//         error: err.message,
//       },
//       {
//         status: 500,
//       },
//     );
//   }
// }

// // app/api/ai-assistant/transcribe-live/route.js
// export async function GET(request) {
//   try {
//     await connectDB();
//     const { searchParams } = new URL(request.url);
//     const roomId = searchParams.get("roomId");
//     const queryUserId = searchParams.get("userId") || "";
//     const userId = resolveRequestUserId(request, queryUserId);
//     const limit = parseInt(searchParams.get("limit") || "50");

//     if (!roomId && !userId) {
//       return NextResponse.json(
//         { error: "Either roomId or userId is required" },
//         { status: 400 },
//       );
//     }

//     let query = {};
//     if (roomId) {
//       query.roomId = roomId;
//     }
//     if (userId) {
//       query.userId = userId;
//     }

//     const summaries = await LiveAssist.find(query)
//       .sort({ createdAt: -1 })
//       .limit(limit)
//       .lean();

//     // Format for frontend
//     const formattedSummaries = summaries.map((s) => ({
//       id: s._id.toString(),
//       text: s.summary,
//       type: s.type || "general",
//       timestamp: s.createdAt,
//       participantName: s.participantName,
//       participantId: s.participantId,
//       wordCount: s.wordCount,
//       sessionId: s.sessionId,
//     }));

//     return NextResponse.json({
//       success: true,
//       summaries: formattedSummaries,
//       total: summaries.length,
//       roomId,
//     });
//   } catch (error) {
//     if (error?.name === "AuthIdentityMismatch") {
//       return NextResponse.json(
//         { success: false, error: "Unauthorized user identity" },
//         { status: 403 },
//       );
//     }

//     console.error("❌ GET error:", error);
//     return NextResponse.json({ error: error.message }, { status: 500 });
//   }
// }