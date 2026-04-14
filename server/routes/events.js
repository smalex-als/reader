import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from '../config.js';

const router = express.Router();
const STREAM_HISTORY_LOG = path.join(DATA_DIR, '.stream-history.log');

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

router.post('/api/stream-history', async (req, res, next) => {
  try {
    const bookId = typeof req.body?.bookId === 'string' ? req.body.bookId.trim() : '';
    if (!bookId) {
      res.status(400).json({ error: 'bookId is required' });
      return;
    }

    const listenedSecondsRaw = Number(req.body?.listenedSeconds);
    const listenedSeconds = Number.isFinite(listenedSecondsRaw)
      ? Math.max(0, Math.round(listenedSecondsRaw * 1000) / 1000)
      : 0;

    const payload = {
      type: 'stream_history',
      timestamp: new Date().toISOString(),
      bookId,
      chapterNumber: Number.isInteger(req.body?.chapterNumber) ? req.body.chapterNumber : null,
      chapterTitle: typeof req.body?.chapterTitle === 'string' ? req.body.chapterTitle.trim() || null : null,
      pageKeyStart: typeof req.body?.pageKeyStart === 'string' ? req.body.pageKeyStart : null,
      pageKeyEnd: typeof req.body?.pageKeyEnd === 'string' ? req.body.pageKeyEnd : null,
      startedAt: typeof req.body?.startedAt === 'string' ? req.body.startedAt : null,
      endedAt: typeof req.body?.endedAt === 'string' ? req.body.endedAt : null,
      listenedSeconds,
      endReason:
        req.body?.endReason === 'completed' ||
        req.body?.endReason === 'stopped' ||
        req.body?.endReason === 'interrupted' ||
        req.body?.endReason === 'error' ||
        req.body?.endReason === 'unload'
          ? req.body.endReason
          : 'stopped'
    };

    await fs.appendFile(STREAM_HISTORY_LOG, `${JSON.stringify(payload)}\n`, 'utf8');
    res.status(202).json({ accepted: true });
  } catch (error) {
    next(error);
  }
});

export default router;
