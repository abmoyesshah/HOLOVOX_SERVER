import mongoose from "mongoose";

const AssistantInfoSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Profile",
      required: true,
    },

    // STEP 1
    name: {
      type: String,
      default: "",
    },

    role: {
      type: String,
      default: "",
    },

    domain: {
      type: String,
      default: "",
    },

    // STEP 2
    naturalStyle: 
      {
        type: String,
      }
  ,

    currentGoal: {
      type: String,
      default: "",
    },

    // STEP 3
    biggestBarrier: 
      {
        type: String,
      },

    peakBestSelf: {
      type: String,
      default: "",
    },

    topObjections: {
      type: String,
      default: "",
    },

    // STEP 4
    slipMoment: {
      type: String,
      default: "",
    },

    limitingBelief: {
      type: String,
      default: "",
    },

    misunderstoodQuality: {
      type: String,
      default: "",
    },

    // STEP 5
    domainAnswers: [{
      type: String,
      default: "",
    }],

    preferredTone: {
      type: String,
      default: "",
    },

    currentNeed: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

const AssistantInfo =
  mongoose.models.AssistantInfo ||
  mongoose.model("AssistantInfo", AssistantInfoSchema);

export default AssistantInfo;