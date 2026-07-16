// app/models/EnterpriseProfile.model.js
import mongoose from "mongoose";

const EnterpriseProfileSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["user", "manager"],
      default: "user",
    },
    enterpriseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Enterprise",
      required: true,
      index: true,
    },
    otp: {
      type: String,
      default: null,
    },
    otpExpiry: {
      type: Date,
      default: null,
    },
    isOtpVerified: {
      type: Boolean,
      default: true,
    },
    isVerified: {
      type: Boolean,
      default: true,
    },
    Subscription: {
      type: String,
      enum: ["enterprise-user", "enterprise-manager"],
      default: "enterprise-user",
    },
    profilePicture: {
      type: String,
      default: null,
    },
    meetingUsed: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for faster queries
EnterpriseProfileSchema.index({ email: 1 });
EnterpriseProfileSchema.index({ enterpriseId: 1 });
EnterpriseProfileSchema.index({ role: 1 });
EnterpriseProfileSchema.index({ isVerified: 1 });

// Update the updatedAt timestamp on save
EnterpriseProfileSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  
});

const EnterpriseProfile =
  mongoose.models.EnterpriseProfile ||
  mongoose.model("EnterpriseProfile", EnterpriseProfileSchema);

export default EnterpriseProfile;