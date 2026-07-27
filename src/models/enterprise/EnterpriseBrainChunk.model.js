// app/models/EnterpriseBrainChunk.model.js
import mongoose from "mongoose";

const EnterpriseBrainChunkSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EnterpriseOrganization",
      required: true,
      index: true,
    },
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BrainTrainingFile",
      required: true,
      index: true,
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
    // Category from the parent file
    category: {
      type: String,
      enum: ["flag_words", "kpi", "compliance", "policies"],
      required: true,
      index: true,
    },
    // Topic fields
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
    section_type: {
      type: String,
      enum: ["header", "paragraph", "list", "table", "general"],
      default: "general",
    },
  },
  {
    timestamps: true,
    collection: "enterprise_brain_chunks",
  }
);

// Indexes for efficient retrieval
EnterpriseBrainChunkSchema.index({ organizationId: 1, category: 1, createdAt: -1 });
EnterpriseBrainChunkSchema.index({ organizationId: 1, topic: 1 });
EnterpriseBrainChunkSchema.index({ organizationId: 1, category: 1, topic_keywords: 1 });
EnterpriseBrainChunkSchema.index({ organizationId: 1, fileId: 1, chunk_index: 1 }, { unique: true });

const EnterpriseBrainChunk =
  mongoose.models.EnterpriseBrainChunk ||
  mongoose.model("EnterpriseBrainChunk", EnterpriseBrainChunkSchema);

export default EnterpriseBrainChunk;