// app/models/BrainChunk.model.js
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
    // New topic-specific fields
    topic: {
      type: String,
      default: "general",
      index: true,
      trim: true,
    },
    topic_header: {
      type: String,
      default: "",
      trim: true,
    },
    topic_keywords: {
      type: [String],
      default: [],
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
    // Metadata for better retrieval
    section_type: {
      type: String,
      enum: ["header", "paragraph", "list", "table", "general"],
      default: "general",
    },
    parent_topic: {
      type: String,
      default: "",
    },
    topic_hierarchy: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: "brain_chunks",
  },
);

// Enhanced indexes for topic-based search
BrainChunkSchema.index({ user_id: 1, topic: 1, createdAt: -1 });
BrainChunkSchema.index({ user_id: 1, topic_keywords: 1 });
BrainChunkSchema.index({ user_id: 1, file_id: 1, chunk_index: 1 }, { unique: true });
BrainChunkSchema.index({ user_id: 1, topic: 1, text: "text" });

const BrainChunk =
  mongoose.models.BrainChunk || mongoose.model("BrainChunk", BrainChunkSchema);

export default BrainChunk;