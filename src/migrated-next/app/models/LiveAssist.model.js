import mongoose from 'mongoose';

const LiveAssistSchema = new mongoose.Schema({
  roomId: { type: String, required: true, index: true },
  participantId: { type: String, required: true },
  participantName: { type: String, required: true },
  summary: { type: String, required: true },
  type: {
    type: String,
    enum: ['general', 'question', 'action', 'decision', 'insight', 'regenerated'],
    default: 'general',
  },
  transcriptText: { type: String, default: '' },
  userId: { type: String, index: true },
  sessionId: { type: String },
  wordCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, index: true },
}, {
  collection: 'LiveAssist',
});

LiveAssistSchema.index({ roomId: 1, createdAt: -1 });
LiveAssistSchema.index({ userId: 1, createdAt: -1 });

LiveAssistSchema.statics.getRoomSummaries = async function (roomId, limit = 50) {
  return this.find({ roomId }).sort({ createdAt: -1 }).limit(limit).lean();
};

const LiveAssist = mongoose.models.LiveAssist || mongoose.model('LiveAssist', LiveAssistSchema);

export default LiveAssist;