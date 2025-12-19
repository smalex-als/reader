import express from 'express';

const router = express.Router();

router.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

export default router;
