import { asyncHandler } from "../utils/AsyncHandler.js";
import { createClient } from "@deepgram/sdk";
import Anthropic from "@anthropic-ai/sdk";

// import connectDB from "../lib/db.js";
import Transcript from "../models/Transcript.model.js";
<<<<<<< HEAD
=======
import { syncEnterpriseTranscript } from "../services/enterprise/enterpriseMeetingSync.service.js";
>>>>>>> 6192a9fe92f4bcdae86a39e37aa2150f22b61dc4

const anthropic = new Anthropic({
  apiKey: process.env.CLOUDAPI,
});

const transcribeAudio = asyncHandler(async (req, res) => {
  try {

    const audio = req.file || req.body.audio;

    const roomId = req.body.roomId;
    const participantId = req.body.participantId;
    const participantName = req.body.participantName;

    if (!audio) {
      return res.status(400).json({
        success: false,
        error: "No audio file",
      });
    }

    // AUDIO BUFFER
    const buffer = Buffer.isBuffer(audio.buffer)
      ? audio.buffer
      : Buffer.from(audio.buffer || audio);

    // DEEPGRAM
    const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

    const { result } =
      await deepgram.listen.prerecorded.transcribeFile(buffer, {
        model: "nova-2",
        smart_format: true,
        language: "en",
      });

    // TEXT
    const text =
      result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";

    console.log("DEEPGRAM TEXT:", text);

    // SKIP EMPTY
    if (!text || text.trim() === "") {
      return res.status(200).json({
        success: true,
        text: "",
      });
    }

    // SAVE TRANSCRIPT
    const saved = await Transcript.create({
      roomId,
      participantId,
      participantName,
      text,
    });

<<<<<<< HEAD
=======
    // 🏢 ENTERPRISE BRIDGE (best-effort, never blocks/fails the normal transcript flow)
    // No-op for regular (non-enterprise) meetings. If the meeting's host is an
    // EnterpriseProfile member, this creates a MeetingTranscript row and runs
    // flag-word detection, writing any hits to UserFlag.
    syncEnterpriseTranscript({
      roomId,
      participantId,
      participantName,
      text,
    }).catch((error) =>
      console.error("Enterprise transcript sync failed:", error.message),
    );

>>>>>>> 6192a9fe92f4bcdae86a39e37aa2150f22b61dc4
    // CLAUDE SUMMARY
    const summaryResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 120,
      messages: [
        {
          role: "user",
          content: `
Summarize this meeting chunk in short bullet points.

Transcript:
${text}
          `,
        },
      ],
    });

    const summary = summaryResponse.content?.[0]?.text || "";

    return res.status(200).json({
      success: true,
      text,
      saved,
      summary,
    });
  } catch (err) {
    console.error("TRANSCRIBE ERROR:", err);

    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

export { transcribeAudio };