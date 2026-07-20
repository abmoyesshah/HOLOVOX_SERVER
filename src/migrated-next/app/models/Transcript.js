// models/Transcript.js
import mongoose from "mongoose";

const TranscriptSchema = new mongoose.Schema(
  {
    roomId: { type: String, index: true },
    participantId: String,
    participantName: String,
    text: String,
  },
  { timestamps: true }
);

export default mongoose.models.Transcript ||
  mongoose.model("Transcript", TranscriptSchema);