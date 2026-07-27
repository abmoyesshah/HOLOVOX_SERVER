import mongoose from "mongoose";

const micAudioSchema = new mongoose.Schema(
  {
    // roomId: { type: String, required: true },
    // sessionId: { type: String, required: true },
    participantId: { type: String, required: true },
    participantName: { type: String, default: "Unknown" },
    audioUrl: { type: String, required: true },
    transcript: { type: String, default: "" },   // ✅ new field
  },
  { timestamps: true }
);

export const MicAudio = mongoose.model("MicAudio", micAudioSchema);