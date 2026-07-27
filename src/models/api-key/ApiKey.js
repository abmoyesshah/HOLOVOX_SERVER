import mongoose from 'mongoose';

const ApiKeySchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  key: { type: String, required: true, unique: true },
  name: { type: String, default: 'Default Key' },
  active: { type: Boolean, default: true },
  rateLimit: { type: Number, default: 100 }, // daily requests
  createdAt: { type: Date, default: Date.now },
  lastUsed: Date,
});

export default mongoose.models.ApiKey || mongoose.model('ApiKey', ApiKeySchema);