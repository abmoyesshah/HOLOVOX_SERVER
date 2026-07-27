import mongoose from "mongoose";

const EnterpriseComplianceSchema = new mongoose.Schema(
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

EnterpriseComplianceSchema.index({ organizationId: 1, createdAt: -1 });

const EnterpriseCompliance =
  mongoose.models.EnterpriseCompliance ||
  mongoose.model("EnterpriseCompliance", EnterpriseComplianceSchema, "enterprisecompliances");

export default EnterpriseCompliance;
