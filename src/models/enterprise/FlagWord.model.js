import mongoose from "mongoose";

const FlagWordSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EnterpriseOrganization",
      required: true,
      index: true,
    },
    sourceFileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BrainTrainingFile",
      default: null,
      index: true,
    },
    word: {
      type: String,
      required: true,
      trim: true,
    },
    normalizedWord: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["flag", "permitted"],
      default: "flag",
      index: true,
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
      index: true,
    },
    category: {
      type: String,
      default: "custom",
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
  },
  { timestamps: true }
);

FlagWordSchema.index(
  { organizationId: 1, normalizedWord: 1, type: 1 },
  { unique: true }
);

const FlagWord =
  mongoose.models.FlagWord || mongoose.model("FlagWord", FlagWordSchema);

export default FlagWord;
