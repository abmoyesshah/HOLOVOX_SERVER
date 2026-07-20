import { asyncHandler } from "../utils/AsyncHandler.js";
import PDFParser from "pdf2json";
import fetch from "node-fetch";

const holoAgent = asyncHandler(async (req, res) => {
  try {
    const message = req.body.message;
    const file = req.file || req.body.file;
    const context = req.body.context;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: "Message is required",
      });
    }

    // =====================================
    // 📄 FILE CONTEXT EXTRACTION
    // =====================================
    let fileContext = "";
    let fileName = "";

    if (file) {
      fileName = file.originalname || file.name;

      try {
        const buffer = Buffer.isBuffer(file.buffer)
          ? file.buffer
          : Buffer.from(file.buffer || file);

        if (file.mimetype === "application/pdf" || file.type === "application/pdf") {
          const pdfParser = new PDFParser();

          fileContext = await new Promise((resolve, reject) => {
            pdfParser.on("pdfParser_dataReady", (pdfData) => {
              try {
                const text = pdfData.Pages.map((page) =>
                  page.Texts.map((t) => decodeURIComponent(t.R[0].T)).join(" ")
                ).join("\n");

                resolve(text.slice(0, 12000));
              } catch (err) {
                reject(err);
              }
            });

            pdfParser.on("pdfParser_dataError", (err) => reject(err));

            pdfParser.parseBuffer(buffer);
          });
        } else if (
          (file.mimetype && file.mimetype.includes("text")) ||
          (file.type && file.type.includes("text"))
        ) {
          fileContext = buffer.toString("utf-8").slice(0, 12000);
        }
      } catch (err) {
        console.log("File parsing error:", err.message);
      }
    }

    // =====================================
    // 🧠 CONTEXT BUILDING
    // =====================================
    let finalPrompt = `User Message:\n${message}`;

    if (fileContext) {
      finalPrompt += `\n\nAttached File Title:\n${fileName}\n\nAttached File Content:\n${fileContext}`;
    }

    if (context) {
      finalPrompt += `\n\nMeeting Transcript So Far:\n${context}`;
    }

    // =====================================
    // 🔥 CLAUDE API CALL
    // =====================================
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.CLOUDAPI,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 60,
        temperature: 0.5,

        system: `
You are Holo Agent, a concise AI assistant inside a live video meeting.

Rules:
- Replies must usually stay under 20 words
- Document summaries must stay under 2 short sentences
- If meeting transcript is provided, use it
- Never over-explain
- Answer directly
- No markdown
- No bullet points
- No headings
- Plain text only

Tone:
- Human
- Professional
- Natural
        `,

        messages: [
          {
            role: "user",
            content: finalPrompt,
          },
        ],
      }),
    });

    const data = await response.json();

    if (data.type === "error") {
      return res.status(400).json({
        success: false,
        error: data.error?.message || "Claude API Error",
      });
    }

    return res.status(200).json({
      success: true,
      reply: data.content?.[0]?.text || "No response",
    });
  } catch (error) {
    console.log("API ERROR:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export { holoAgent };