import express from 'express';

const router = express.Router();

router.post('/api/events', async (req, res, next) => {
  try {
    const event = typeof req.body?.event === 'string' ? req.body.event.trim() : '';
    if (!event) {
      res.status(400).json({ error: 'Event name is required' });
      return;
    }
    const properties =
      req.body?.properties && typeof req.body.properties === 'object' ? req.body.properties : {};
    const payload = {
      event,
      properties,
      timestamp: new Date().toISOString()
    };
    // eslint-disable-next-line no-console
    console.log('analytics_event', payload);
    res.status(202).json({ accepted: true });
  } catch (error) {
    next(error);
  }
});

export default router;
