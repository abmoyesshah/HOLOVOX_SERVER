import mongoose from "mongoose";

const EnterpriseRuleSchema = new mongoose.Schema(
  {
    enterpriseId: { type: String, required: true, index: true },
    packId: { type: String, default: "custom", index: true },
    packName: { type: String, default: "Custom" },
    ruleText: { type: String, required: true, trim: true },
    normalizedRuleText: { type: String, required: true, trim: true, index: true },
    severityDefault: {
      type: String,
      enum: ["high", "med", "low"],
      default: "med",
      index: true,
    },
    enabled: { type: Boolean, default: true, index: true },
    source: {
      type: String,
      enum: ["manual", "brain-file", "pack"],
      default: "manual",
      index: true,
    },
    sourceFileName: { type: String, default: "" },
    createdBy: { type: String, default: "" },
  },
  {
    timestamps: true,
  },
);

EnterpriseRuleSchema.index({ enterpriseId: 1, enabled: 1, packId: 1 });

const EnterpriseRuleModel =
  mongoose.models.EnterpriseRule ||
  mongoose.model("EnterpriseRule", EnterpriseRuleSchema);

export default EnterpriseRuleModel;
