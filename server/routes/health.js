import express from 'express';
import { isBackgroundQueueEnabled } from '../lib/backgroundJobs.js';

const router = express.Router();

router.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    backgroundJobs: isBackgroundQueueEnabled() ? 'bullmq' : 'inline'
  });
});

export default router;
