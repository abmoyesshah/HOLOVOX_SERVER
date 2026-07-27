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
    // What kind of content this file was uploaded as. Determines which
    // downstream collection the extracted content is imported into:
    // flag_words -> FlagWord/UserFlag ("Enterprise Flags"), kpi -> EnterpriseKpi,
    // compliance -> EnterpriseCompliance, policies -> EnterprisePolicy.
    category: {
      type: String,
      enum: ["flag_words", "kpi", "compliance", "policies"],
      default: "flag_words",
      index: true,
    },
    size: {
      type: Number,
      default: 0,
    },
    extractedText: {
      type: String,
      default: "",
    },
    fileData: {
      type: Buffer,
      select: false,
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
    // Manager -> owner suggestion workflow. Owner-uploaded files default to
    // "accepted" so they behave exactly as before; manager suggestions start
    // "pending" and only join the Brain (brainSources) once the owner accepts.
    reviewStatus: {
      type: String,
      enum: ["accepted", "pending", "rejected"],
      default: "accepted",
      index: true,
    },
    suggestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    suggestedByName: {
      type: String,
      default: "",
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

BrainTrainingFileSchema.index({ organizationId: 1, createdAt: -1 });

const BrainTrainingFile =
  mongoose.models.BrainTrainingFile ||
  mongoose.model("BrainTrainingFile", BrainTrainingFileSchema);

export default BrainTrainingFile;
