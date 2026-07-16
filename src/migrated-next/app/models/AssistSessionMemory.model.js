import mongoose from "mongoose";

const AssistSessionMemorySchema = new mongoose.Schema(
  {
    user_id: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    room_id: {
      type: String,
      default: "",
      index: true,
      trim: true,
    },
    session_id: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ["user", "assistant", "system"],
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
    source_refs: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: "assist_session_memory",
  },
);

AssistSessionMemorySchema.index({ user_id: 1, session_id: 1, createdAt: -1 });

const AssistSessionMemory =
  mongoose.models.AssistSessionMemory ||
  mongoose.model("AssistSessionMemory", AssistSessionMemorySchema);

export default AssistSessionMemory;
