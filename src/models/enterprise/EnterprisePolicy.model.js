import mongoose from "mongoose";

const EnterprisePolicySchema = new mongoose.Schema(
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
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    extractedText: {
      type: String,
      default: "",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

EnterprisePolicySchema.index({ organizationId: 1, createdAt: -1 });

const EnterprisePolicy =
  mongoose.models.EnterprisePolicy ||
  mongoose.model("EnterprisePolicy", EnterprisePolicySchema, "enterprisepolicies");

export default EnterprisePolicy;
