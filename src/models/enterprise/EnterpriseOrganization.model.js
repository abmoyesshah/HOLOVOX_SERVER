import mongoose from "mongoose";

const EnterpriseOrganizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Profile",
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "disabled"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true }
);

const EnterpriseOrganization =
  mongoose.models.EnterpriseOrganization ||
  mongoose.model("EnterpriseOrganization", EnterpriseOrganizationSchema);

export default EnterpriseOrganization;
