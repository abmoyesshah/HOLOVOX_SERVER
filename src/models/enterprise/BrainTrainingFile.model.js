import mongoose from "mongoose";

const BrainTrainingFileSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EnterpriseOrganization",
      required: true,
      index: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    originalName: {
      type: String,
      required: true,
      trim: true,
    },
    mimeType: {
      type: String,
      default: "application/octet-stream",
      trim: true,
    },
    size: {
      type: Number,
      default: 0,
    },
    extractedText: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["pending", "ready", "failed"],
      default: "ready",
      index: true,
    },
    parseError: {
      type: String,
      default: "",
    },
    flagWordCount: {
      type: Number,
      default: 0,
    },
    permittedWordCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

BrainTrainingFileSchema.index({ organizationId: 1, createdAt: -1 });

const BrainTrainingFile =
  mongoose.models.BrainTrainingFile ||
  mongoose.model("BrainTrainingFile", BrainTrainingFileSchema);

export default BrainTrainingFile;
