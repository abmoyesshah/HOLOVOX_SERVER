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

    industry: {
      type: String,
      default: "",
    },

    // STEP 2
    callTypes: [
      {
        type: String,
      },
    ],

    context: {
      type: String,
      default: "",
    },

    // STEP 3
    goals: [
      {
        type: String,
      },
    ],

    weakness: {
      type: String,
      default: "",
    },

    strengths: {
      type: String,
      default: "",
    },

    // STEP 4
    tone: {
      type: String,
      default: "",
    },

    pace: {
      type: String,
      default: "",
    },

    reminderStyle: {
      type: String,
      default: "",
    },

    // STEP 5
    arEnabled: {
      type: Boolean,
      default: false,
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