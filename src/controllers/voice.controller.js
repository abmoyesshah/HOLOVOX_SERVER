import { asyncHandler } from "../utils/AsyncHandler.js";
import fetch from "node-fetch";

const textToSpeech = asyncHandler(async (req, res) => {
  const { text } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({
      success: false,
      error: "Text is required",
    });
  }

  try {
    // 👉 make speech slower by adding pauses
    const slowText = text
      .replace(/\./g, "...")
      .replace(/,/g, ", ");

    const response = await fetch(
      "https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL",
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: slowText,
          model_id: "eleven_turbo_v2",
          voice_settings: {
            stability: 0.8,
            similarity_boost: 0.4,
            style: 0.2,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      return res.status(response.status).json({
        success: false,
        error: errorText,
      });
    }

    const audioBuffer = await response.arrayBuffer();

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");

    return res.status(200).send(Buffer.from(audioBuffer));
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export { textToSpeech };