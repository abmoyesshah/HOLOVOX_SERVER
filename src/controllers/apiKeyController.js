import ApiKey from '../models/api-key/ApiKey.js';
import UsageLog from '../models/api-key/UsageLog.js';
import { randomBytes } from 'crypto';

// Generate a new API key for a user
export const generateApiKey = async (req, res) => {
  try {
    const { userId, name } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    const newKey = `holo_${randomBytes(16).toString('hex')}`;
    const keyDoc = await ApiKey.create({
      userId,
      key: newKey,
      name: name || 'Default Key',
    });
    res.status(201).json({
      apiKey: keyDoc.key,
      userId: keyDoc.userId,
      name: keyDoc.name,
      createdAt: keyDoc.createdAt,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// List all keys for a user (admin or self)
export const listKeys = async (req, res) => {
  try {
    const { userId } = req.query; // or from authenticated user
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    const keys = await ApiKey.find({ userId }).select('-__v');
    res.json({ keys });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Revoke (deactivate) a key
export const revokeKey = async (req, res) => {
  try {
    const { keyId } = req.params;
    const updated = await ApiKey.findByIdAndUpdate(keyId, { active: false }, { new: true });
    if (!updated) {
      return res.status(404).json({ error: 'Key not found' });
    }
    res.json({ success: true, key: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get usage stats for a user
export const getUsage = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    const today = new Date();
    today.setHours(0,0,0,0);
    const total = await UsageLog.countDocuments({ userId });
    const todayCount = await UsageLog.countDocuments({
      userId,
      timestamp: { $gte: today }
    });
    const last30Days = await UsageLog.aggregate([
      { $match: { userId, timestamp: { $gte: new Date(Date.now() - 30*24*60*60*1000) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    res.json({ total, today: todayCount, last30Days });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};