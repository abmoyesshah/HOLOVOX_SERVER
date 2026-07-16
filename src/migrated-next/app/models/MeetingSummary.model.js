import mongoose from "mongoose";

const MeetingSummarySchema = new mongoose.Schema(
  {
    roomId: { type: String, index: true, required: true, unique: true },
    userId: { type: String, index: true },

    participants: [
      {
        participantId: String,
        participantName: String,
      },
    ],

    transcriptCount: { type: Number, default: 0 },

    summary: { type: String, default: "" },

    status: {
      type: String,
      enum: ["pending", "generating", "ready", "failed"],
      default: "pending",
    },

    error: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.models.MeetingSummary ||
  mongoose.model("MeetingSummary", MeetingSummarySchema);