import mongoose from "mongoose";

const PlaybookSchema = new mongoose.Schema(
  {
    user_id: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    usage_count: {
      type: Number,
      default: 0,
    },
    is_private: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    collection: "playbooks",
  },
);

PlaybookSchema.index({ user_id: 1, createdAt: -1 });

const Playbook =
  mongoose.models.Playbook || mongoose.model("Playbook", PlaybookSchema);

export default Playbook;