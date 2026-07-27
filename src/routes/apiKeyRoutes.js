import express from 'express';
import {
  generateApiKey,
  listKeys,
  revokeKey,
  getUsage,
} from '../controllers/apiKeyController.js';

const router = express.Router();

// Mounted at /api/keys, so use root paths
router.post('/', generateApiKey);        // POST /api/keys
router.get('/', listKeys);               // GET /api/keys?userId=...
router.delete('/:keyId', revokeKey);     // DELETE /api/keys/:keyId
router.get('/usage', getUsage);          // GET /api/keys/usage?userId=...

export default router;