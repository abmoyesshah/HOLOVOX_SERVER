import { NextResponse } from "../../../utils/next-response.js";
import PDFParser from "pdf2json";
import Anthropic from "@anthropic-ai/sdk";
import connectDB from "../../../lib/db.js";
import {
  buildAssistContext,
  buildContextPrompt,
  saveAssistMemory,
} from "../../../lib/ai-assistant/context-builder.js";
import { resolveRequestUserId } from "../../../lib/auth-user.js";

const anthropic = new Anthropic({
  apiKey: process.env.CLOUDAPI,
});

export async function POST(req) {
  try {
    const formData = await req.formData();
    const message = formData.get("message");
    const file = formData.get("file");
    const context = formData.get("context");
    const roomId = formData.get("roomId");
    const sessionIdInput = formData.get("sessionId");
    const candidateUserId = formData.get("userId");

    const userId = resolveRequestUserId(req, typeof candidateUserId === "string" ? candidateUserId : "");
    const sessionId =
      typeof sessionIdInput === "string" && sessionIdInput.trim()
        ? sessionIdInput.trim()
        : `${typeof roomId === "string" && roomId.trim() ? roomId.trim() : "chat-room"}:${userId || "anon"}`;

    if (!message) {
      return NextResponse.json(
        { success: false, error: "Message is required" },
        { status: 400 }
      );
    }

    // =====================================
    // 📄 FILE CONTEXT EXTRACTION
    // =====================================
    let fileContext = "";
    let fileName = "";

    if (file) {
      fileName = file.name;
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        if (file.type === "application/pdf") {
          const pdfParser = new PDFParser();
          fileContext = await new Promise((resolve, reject) => {
            pdfParser.on("pdfParser_dataReady", (pdfData) => {
              try {
                const text = pdfData.Pages.map((page) =>
                  page.Texts.map((text) =>
                    decodeURIComponent(text.R[0].T)
                  ).join(" ")
                ).join("\n");
                resolve(text.slice(0, 12000));
              } catch (err) {
                reject(err);
              }
            });
            pdfParser.on("pdfParser_dataError", (err) => {
              reject(err);
            });
            pdfParser.parseBuffer(buffer);
          });
        } else if (file.type.includes("text")) {
          fileContext = buffer.toString("utf-8").slice(0, 12000);
        }
      } catch (err) {
        console.log("File parsing error:", err.message);
      }
    }

    await connectDB();

    const assistContext = await buildAssistContext({
      userId,
      roomId: typeof roomId === "string" ? roomId : "",
      sessionId,
      queryText: `${message}\n${typeof context === "string" ? context : ""}\n${fileContext}`,
    });

    // =====================================
    // 🧠 PROMPT BUILDING
    // =====================================
    let finalPrompt = `User Message:\n${message}`;

    if (fileContext) {
      finalPrompt += `\n\nAttached File Title:\n${fileName}\n\nAttached File Content:\n${fileContext}`;
    }

    if (context) {
      finalPrompt += `\n\nMeeting Transcript So Far:\n${context}`;
    }

    const contextPrompt = buildContextPrompt(assistContext);

    const claudeResponse = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 120,
      temperature: 0.3,
      system: `
You are Holo Agent, a high-performance real-time assistant.

Use this context to answer with precision and relevance:
${contextPrompt}

Rules:
- Keep reply concise and actionable.
- Prefer concrete next actions and language suggestions.
- Use retrieved brain context when relevant.
- Never fabricate facts.
- Plain text only; no markdown or bullets.
- Priority enforcement:
  1) Questionnaire/profile sets tone, goals, and coaching lens.
  2) Assistant persona adjusts delivery style only.
  3) Session memory/summaries keep continuity and should not override present intent.
  4) Brain evidence supports or corrects only when directly relevant.
  5) Current user message drives the immediate response.
`,
      messages: [
        {
          role: "user",
          content: finalPrompt,
        },
      ],
    });

    const reply = claudeResponse.content?.[0]?.text || "No response";

    await saveAssistMemory({
      userId,
      roomId: typeof roomId === "string" ? roomId : "",
      sessionId,
      role: "user",
      text: String(message),
    });

    await saveAssistMemory({
      userId,
      roomId: typeof roomId === "string" ? roomId : "",
      sessionId,
      role: "assistant",
      text: reply,
      sourceRefs: assistContext.retrievedChunks.map((item) => item.fileName),
    });

    return NextResponse.json({
      success: true,
      reply,
      sessionId,
      retrieved: assistContext.retrievedChunks.map((item) => ({
        fileName: item.fileName,
        score: item.score,
      })),
    });

  } catch (error) {
    if (error?.name === "AuthIdentityMismatch") {
      return NextResponse.json(
        { success: false, error: "Unauthorized user identity" },
        { status: 403 },
      );
    }

    console.error("AI ASSISTANT ERROR:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}