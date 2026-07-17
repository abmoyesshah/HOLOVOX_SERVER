import mongoose from "mongoose";

const freeTrialProfileSchema = new mongoose.Schema(
  {
    id: {
      type: mongoose.Types.ObjectId,
      required: true,
      unique: true,
      ref: "User",
    },
    fullName: {
      type: String,
      required: true,
    },
    Subscription: {
      type: String,
      enum: ["free", "assist", "spark", "enterprise"],
      default: "free",
    },
    email: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
    trialStartDate: {
      type: Date,
      default: Date.now,
    },
    trialEndDate: {
      type: Date,
      required: true,
    },
    isTrialActive: {
      type: Boolean,
      default: true,
    },
    trialStatus: {
      type: String,
      enum: ["active", "expired", "cancelled", "converted"],
      default: "active",
    },
    trialDays: {
      type: Number,
      default: 7,
    },
    cardDetails: {
      cardNum: { type: String, required: true },
      expiryDate: { type: String, required: true },
      cvv: { type: String, required: true },
      nameOnCard: { type: String, required: true },
    },
    paymentMethod: {
      type: String,
      enum: ["card", "paypal", "stripe"],
      default: "card",
    },
    stripeCustomerId: {
      type: String,
    },
    stripeSubscriptionId: {
      type: String,
    },
  },
  { timestamps: true },
);

const FreeTrialProfiles =
  mongoose.models.FreeTrialProfiles ||
  mongoose.model("FreeTrialProfiles", freeTrialProfileSchema);

export default FreeTrialProfiles;
