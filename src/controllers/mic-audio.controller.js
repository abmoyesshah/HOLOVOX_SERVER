import { MicAudio } from "../models/dashboard-assist/MicAudio.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";   // ✅ install openai package

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function saveAudioFile(buffer, roomId, participantId) {
  const uploadDir = path.join(__dirname, "../../public/uploads/mic-audio");
  await fs.mkdir(uploadDir, { recursive: true });
  const filename = `mic-${roomId}-${participantId}-${Date.now()}.webm`;
  const filePath = path.join(uploadDir, filename);
  await fs.writeFile(filePath, buffer);
  return `/uploads/mic-audio/${filename}`;
}

export const uploadMicrophoneAudio = async (req, res) => {
  console.log("🔵 POST /microphone-audio called");
  console.log("🔵 Body:", req.body);
  console.log("🔵 File size:", req.file?.size);

  try {
    const { roomId, sessionId, participantId, participantName } = req.body;
    const audioBuffer = req.file?.buffer;

    if (!participantId || !audioBuffer) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // 1. Save audio file
    const audioUrl = await saveAudioFile(audioBuffer, roomId, participantId);

    // 2. Transcribe audio with Whisper
    let transcript = "";
    try {
      // Convert buffer to readable stream or use File object
      // OpenAI SDK expects a File or readable stream
      // We'll create a temporary file or use a Blob
      const file = new File([audioBuffer], "audio.webm", { type: "audio/webm" });
      const response = await openai.audio.transcriptions.create({
        file: file,
        model: "whisper-1",
        language: "en", // or auto-detect
      });
      transcript = response.text;
      console.log("📝 Transcript:", transcript);
    } catch (whisperError) {
      console.error("❌ Whisper transcription failed:", whisperError);
      // We still save the audio, but transcript remains empty
    }

    // 3. Save to MongoDB
    const newAudio = new MicAudio({
      roomId,
      sessionId,
      participantId,
      participantName: participantName || "Unknown",
      audioUrl,
      transcript,   // ✅ saved
    });
    await newAudio.save();

    return res.status(201).json({
      success: true,
      id: newAudio._id,
      audioUrl,
      transcript,
    });
  } catch (error) {
    console.error("Error saving microphone audio:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteMicrophoneAudio = async(req, res) => {
  try {
     const userId = req.params.userId;
     console.log("deleting audio files for user: ",userId);
    const deletedAudios = await MicAudio.deleteMany({participantId: userId});
    if(!deletedAudios){
      return res.status(400).json({error: "no audios found!"});
    }
    console.log("audios deleted: ",deletedAudios);
    return res.status(200).json({success: true, deletedAudios});
  } catch (error) {
    return res.status(500).json({error: "internal server error"});
  }
}