import mongoose from "mongoose";

const BrainChunkSchema = new mongoose.Schema(
  {
    user_id: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    file_id: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    file_name: {
      type: String,
      default: "",
      trim: true,
    },
    chunk_index: {
      type: Number,
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
    keywords: {
      type: [String],
      default: [],
    },
    token_count: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    collection: "brain_chunks",
  },
);

BrainChunkSchema.index({ user_id: 1, updatedAt: -1 });
BrainChunkSchema.index({ user_id: 1, file_id: 1, chunk_index: 1 }, { unique: true });

const BrainChunk =
  mongoose.models.BrainChunk || mongoose.model("BrainChunk", BrainChunkSchema);

export default BrainChunk;
