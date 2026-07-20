import mongoose from "mongoose";

const EnterpriseFlagSchema = new mongoose.Schema(
  {
    enterpriseId: { type: String, required: true, index: true },
    meetingId: { type: String, required: true, index: true },
    roomId: { type: String, required: true, index: true },
    participantId: { type: String, default: "", index: true },
    participantName: { type: String, default: "Unknown" },
    severity: {
      type: String,
      enum: ["high", "med", "low"],
      default: "med",
      index: true,
    },
    title: { type: String, required: true },
    quote: { type: String, default: "" },
    ruleId: { type: String, default: "", index: true },
    ruleText: { type: String, default: "" },
    fingerprint: { type: String, default: "", index: true },
    sourceTranscriptId: { type: String, default: "", index: true },
    sourceType: {
      type: String,
      enum: ["transcript", "manual"],
      default: "transcript",
    },
    confidence: { type: Number, default: 0.8 },
    stage: { type: Number, min: 0, max: 4, default: 0, index: true },
    status: {
      type: String,
      enum: ["open", "resolved"],
      default: "open",
      index: true,
    },
    detectedAt: { type: Date, default: Date.now, index: true },
    resolvedAt: { type: Date, default: null },
    lastUpdatedBy: { type: String, default: "" },
  },
  {
    timestamps: true,
  },
);

EnterpriseFlagSchema.index({ enterpriseId: 1, meetingId: 1, createdAt: -1 });
EnterpriseFlagSchema.index({ enterpriseId: 1, participantId: 1, status: 1 });

const EnterpriseFlagModel =
  mongoose.models.EnterpriseFlag ||
  mongoose.model("EnterpriseFlag", EnterpriseFlagSchema);

export default EnterpriseFlagModel;
