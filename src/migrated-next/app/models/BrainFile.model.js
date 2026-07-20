import mongoose from "mongoose";

const BrainFileSchema = new mongoose.Schema(
  {
    user_id: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    file_name: {
      type: String,
      required: true,
      trim: true,
    },
    file_path: {
      type: String,
      required: true,
      trim: true,
    },
    file_size: {
      type: Number,
      default: 0,
    },
    file_type: {
      type: String,
      default: "application/octet-stream",
      trim: true,
    },
    gridfs_file_id: {
      type: String,
      required: true,
      trim: true,
    },
    bucket_name: {
      type: String,
      default: "brainFiles",
      trim: true,
    },
    ingestion_status: {
      type: String,
      enum: ["pending", "ready", "failed"],
      default: "pending",
      index: true,
    },
    ingestion_error: {
      type: String,
      default: "",
    },
    chunk_count: {
      type: Number,
      default: 0,
    },
    parse_chars: {
      type: Number,
      default: 0,
    },
    last_ingested_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "brain_files",
  },
);

BrainFileSchema.index({ user_id: 1, createdAt: -1 });

const BrainFile =
  mongoose.models.BrainFile || mongoose.model("BrainFile", BrainFileSchema);

export default BrainFile;