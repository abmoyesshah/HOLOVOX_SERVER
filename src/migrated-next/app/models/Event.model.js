// app/models/Event.model.js
import mongoose from "mongoose";

const EventSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        "meeting.created",
        "meeting.updated",
        "meeting.deleted",
        "meeting.started",
        "meeting.ended",
        "meeting.joined",
        "meeting.left",
        "meeting.invited",
        "transcript.created",
        "transcript.processed",
        "transcript.saved",
        "transcript.shared",
        "summary.created",
        "summary.ready",
        "summary.shared",
        "task.created",
        "task.assigned",
        "task.completed",
        "task.overdue",
        "task.updated",
        "agent.initialized",
        "agent.suggestion",
        "agent.insight",
        "agent.coaching",
        "user.onboarding_complete",
        "user.enterprise_added",
        "user.role_changed",
        "recording.started",
        "recording.stopped",
        "recording.ready",
      ],
    },
    entityId: {
      type: String,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    priority: {
      type: String,
      enum: ["high", "normal", "low"],
      default: "normal",
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    triggeredBy: {
      type: String,
    },
    actionLink: {
      type: String,
    },
    icon: {
      type: String,
    },
    color: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for faster queries
EventSchema.index({ userId: 1, createdAt: -1 });
EventSchema.index({ userId: 1, isRead: 1 });
EventSchema.index({ entityId: 1 });

// ✅ Static methods - these are accessed via the model
EventSchema.statics.createEvent = async function(data) {
  return this.create({
    userId: data.userId,
    type: data.type,
    entityId: data.entityId || null,
    title: data.title,
    description: data.description || "",
    priority: data.priority || "normal",
    metadata: data.metadata || {},
    triggeredBy: data.triggeredBy || null,
    actionLink: data.actionLink || null,
    icon: data.icon || null,
    color: data.color || null,
  });
};

EventSchema.statics.getUnreadCount = function(userId) {
  return this.countDocuments({ userId, isRead: false });
};

EventSchema.statics.markAsRead = function(userId, eventId = null) {
  const query = { userId };
  if (eventId) {
    query._id = eventId;
  }
  return this.updateMany(query, { isRead: true });
};

EventSchema.statics.getUserEvents = function(userId, limit = 50) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

const Event = mongoose.models.Event || mongoose.model("Event", EventSchema);

export default Event;