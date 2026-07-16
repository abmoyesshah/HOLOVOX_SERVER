// app/models/Task.model.js
import mongoose from "mongoose";

const TaskSchema = new mongoose.Schema(
  {
    meetingId: {
      type: String,
      required: true,
      index: true,
    },
    meetingTitle: {
      type: String,
      default: "Meeting",
    },
    userId: {
      type: String,
      index: true,
    },
    userEmail: {
      type: String,
      index: true,
    },
    userName: {
      type: String,
      index: true,
    },
    task: {
      type: String,
      required: true,
    },
    context: {
      type: String,
      default: "",
    },
    assignedBy: {
      type: String,
      default: "Unknown",
    },
    priority: {
      type: String,
      enum: ["high", "medium", "low"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["pending", "in_progress", "completed", "cancelled"],
      default: "pending",
      index: true,
    },
    source: {
      type: String,
      enum: ["transcript_analysis", "manual", "imported"],
      default: "transcript_analysis",
    },
    dueDate: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
TaskSchema.index({ userId: 1, status: 1 });
TaskSchema.index({ userEmail: 1, status: 1 });
TaskSchema.index({ userName: 1 });
TaskSchema.index({ meetingId: 1, userId: 1 });
TaskSchema.index({ createdAt: -1 });

// ✅ NO pre-save hooks - completely removed





const Task = mongoose.models.Task || mongoose.model("Task", TaskSchema);

export default Task;