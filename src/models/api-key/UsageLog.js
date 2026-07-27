import mongoose from 'mongoose';

const UsageLogSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  apiKey: { type: String, required: true },
  endpoint: String,
  method: String,
  status: Number,
  timestamp: { type: Date, default: Date.now, index: true },
});

export default mongoose.models.UsageLog || mongoose.model('UsageLog', UsageLogSchema);