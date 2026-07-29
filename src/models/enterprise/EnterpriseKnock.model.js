import mongoose from "mongoose";

const EnterpriseKnockSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EnterpriseOrganization",
      required: true,
      index: true,
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EnterpriseProfile",
      required: true,
      index: true,
    },
    fromId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    fromName: {
      type: String,
      trim: true,
    },
    fromRole: {
      type: String,
      enum: ["owner", "manager", "rep"],
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

const EnterpriseKnock =
  mongoose.models.EnterpriseKnock || mongoose.model("EnterpriseKnock", EnterpriseKnockSchema);

export default EnterpriseKnock;
