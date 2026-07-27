import ApiKey from '../models/api-key/ApiKey.js';
import UsageLog from '../models/api-key/UsageLog.js';
import {connectDB} from '../db/DB.js';

export async function validateApiKey(req) {
  await connectDB();
  const apiKey = req.headers['x-api-key'] || req.headers.authorization?.replace('Bearer ', '');
  if (!apiKey) {
    return { error: 'Missing API key', status: 401 };
  }
  const keyDoc = await ApiKey.findOne({ key: apiKey, active: true });
  if (!keyDoc) {
    return { error: 'Invalid or inactive API key', status: 403 };
  }
  // Rate limit check (daily)
  const today = new Date();
  today.setHours(0,0,0,0);
  const count = await UsageLog.countDocuments({
    userId: keyDoc.userId,
    timestamp: { $gte: today }
  });
  if (count >= keyDoc.rateLimit) {
    return { error: 'Rate limit exceeded', status: 429 };
  }
  await ApiKey.updateOne({ _id: keyDoc._id }, { lastUsed: new Date() });
  return { userId: keyDoc.userId };
}

// Express middleware function
export function apiKeyAuth(req, res, next) {
  validateApiKey(req).then(result => {
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }
    req.userId = result.userId;
    next();
  }).catch(err => {
    res.status(500).json({ error: 'Internal server error' });
  });
}