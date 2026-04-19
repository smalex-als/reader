import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from '../config.js';

const router = express.Router();
const STREAM_HISTORY_LOG = path.join(DATA_DIR, '.stream-history.log');
const SESSION_GROUP_GAP_MS = 60 * 1000;

function normalizeStreamSource(pageKey) {
  if (typeof pageKey !== 'string' || !pageKey) {
    return { sourceType: 'unknown', sourceLabel: 'Unknown' };
  }
  if (pageKey.startsWith('quiz::') && pageKey.endsWith('::answer')) {
    return {
      sourceType: 'quiz',
      sourceLabel: 'Quiz'
    };
  }
  if (pageKey.startsWith('quiz::')) {
    return {
      sourceType: 'quiz',
      sourceLabel: 'Quiz'
    };
  }
  if (pageKey.startsWith('vocabulary::')) {
    return { sourceType: 'vocabulary', sourceLabel: 'Vocabulary' };
  }
  if (pageKey.startsWith('memory-card::')) {
    return { sourceType: 'memory-card', sourceLabel: 'Memory Card' };
  }
  if (pageKey.startsWith('chapter::paragraph-start-')) {
    return { sourceType: 'chapter', sourceLabel: 'Chapter Text' };
  }
  if (pageKey.startsWith('narration::paragraph-start-')) {
    return { sourceType: 'chapter', sourceLabel: 'Chapter Text' };
  }
  if (pageKey.includes('::ocr-block-')) {
    return { sourceType: 'page', sourceLabel: 'Page Audio' };
  }
  if (pageKey.startsWith('/data/') || pageKey.includes('#chunk-')) {
    return { sourceType: 'page', sourceLabel: 'Page Audio' };
  }
  return { sourceType: 'single', sourceLabel: 'Single item' };
}

function buildEmptyDashboard() {
  return {
    generatedAt: new Date().toISOString(),
    totals: {
      sessions: 0,
      totalSeconds: 0,
      averageSeconds: 0,
      daysActive: 0,
      lastListenedAt: null
    },
    byDay: [],
    bySource: [],
    topBooks: [],
    topChapters: [],
    recentSessions: []
  };
}

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
      subchapterTitle:
        typeof req.body?.subchapterTitle === 'string' ? req.body.subchapterTitle.trim() || null : null,
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

router.get('/api/stream-history/dashboard', async (_req, res, next) => {
  try {
    let raw = '';
    try {
      raw = await fs.readFile(STREAM_HISTORY_LOG, 'utf8');
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        res.json(buildEmptyDashboard());
        return;
      }
      throw error;
    }

    const entries = raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((entry) => entry && entry.type === 'stream_history');

    if (entries.length === 0) {
      res.json(buildEmptyDashboard());
      return;
    }

    const normalizedEntries = entries
      .map((entry) => {
        const listenedSeconds = Number.isFinite(entry.listenedSeconds) ? entry.listenedSeconds : 0;
        const timestamp = typeof entry.timestamp === 'string' ? entry.timestamp : new Date().toISOString();
        const { sourceType, sourceLabel } = normalizeStreamSource(entry.pageKeyStart);
        const bookId = typeof entry.bookId === 'string' ? entry.bookId : 'unknown';

        return {
          timestamp,
          bookId,
          chapterNumber: Number.isInteger(entry.chapterNumber) ? entry.chapterNumber : null,
          chapterTitle: typeof entry.chapterTitle === 'string' ? entry.chapterTitle : null,
          subchapterTitle: typeof entry.subchapterTitle === 'string' ? entry.subchapterTitle : null,
          sourceType,
          sourceLabel,
          listenedSeconds,
          startedAt: typeof entry.startedAt === 'string' ? entry.startedAt : timestamp,
          endedAt: typeof entry.endedAt === 'string' ? entry.endedAt : timestamp,
          endReason:
            entry.endReason === 'completed' ||
            entry.endReason === 'stopped' ||
            entry.endReason === 'interrupted' ||
            entry.endReason === 'error' ||
            entry.endReason === 'unload'
              ? entry.endReason
              : 'stopped'
        };
      });

    const groupedSessions = normalizedEntries
      .sort((left, right) => left.startedAt.localeCompare(right.startedAt))
      .reduce((groups, entry) => {
        const previous = groups[groups.length - 1];
        const previousEndedAt = previous ? Date.parse(previous.endedAt) : Number.NaN;
        const currentStartedAt = Date.parse(entry.startedAt);
        const withinGap =
          Number.isFinite(previousEndedAt) &&
          Number.isFinite(currentStartedAt) &&
          currentStartedAt - previousEndedAt <= SESSION_GROUP_GAP_MS;
        if (
          previous &&
          previous.bookId === entry.bookId &&
          previous.chapterNumber === entry.chapterNumber &&
          previous.chapterTitle === entry.chapterTitle &&
          previous.subchapterTitle === entry.subchapterTitle &&
          previous.sourceType === entry.sourceType &&
          withinGap
        ) {
          previous.listenedSeconds += entry.listenedSeconds;
          previous.timestamp = previous.timestamp > entry.timestamp ? previous.timestamp : entry.timestamp;
          previous.startedAt = previous.startedAt < entry.startedAt ? previous.startedAt : entry.startedAt;
          previous.endedAt = previous.endedAt > entry.endedAt ? previous.endedAt : entry.endedAt;
          previous.sessionCount += 1;
          previous.endReason = entry.endReason;
          return groups;
        }
        groups.push({
          ...entry,
          sessionCount: 1
        });
        return groups;
      }, []);

    const byDay = new Map();
    const bySource = new Map();
    const byBook = new Map();
    const byChapter = new Map();
    const activeDays = new Set();
    let totalSeconds = 0;
    let lastListenedAt = null;

    for (const session of groupedSessions) {
      const day = session.timestamp.slice(0, 10);
      activeDays.add(day);
      totalSeconds += session.listenedSeconds;
      if (!lastListenedAt || session.timestamp > lastListenedAt) {
        lastListenedAt = session.timestamp;
      }

      const dayAggregate = byDay.get(day) ?? { date: day, sessions: 0, totalSeconds: 0 };
      dayAggregate.sessions += 1;
      dayAggregate.totalSeconds += session.listenedSeconds;
      byDay.set(day, dayAggregate);

      const sourceAggregate =
        bySource.get(session.sourceType) ?? {
          sourceType: session.sourceType,
          label: session.sourceLabel,
          sessions: 0,
          totalSeconds: 0
        };
      sourceAggregate.sessions += 1;
      sourceAggregate.totalSeconds += session.listenedSeconds;
      bySource.set(session.sourceType, sourceAggregate);

      const bookAggregate =
        byBook.get(session.bookId) ?? { bookId: session.bookId, sessions: 0, totalSeconds: 0, lastListenedAt: null };
      bookAggregate.sessions += 1;
      bookAggregate.totalSeconds += session.listenedSeconds;
      bookAggregate.lastListenedAt =
        !bookAggregate.lastListenedAt || session.timestamp > bookAggregate.lastListenedAt
          ? session.timestamp
          : bookAggregate.lastListenedAt;
      byBook.set(session.bookId, bookAggregate);

      const chapterKey = `${session.bookId}::${session.chapterNumber ?? 'none'}::${session.chapterTitle ?? ''}::${session.subchapterTitle ?? ''}`;
      const chapterAggregate = byChapter.get(chapterKey) ?? {
        bookId: session.bookId,
        chapterNumber: session.chapterNumber,
        chapterTitle: session.chapterTitle,
        subchapterTitle: session.subchapterTitle,
        sessions: 0,
        totalSeconds: 0,
        lastListenedAt: null
      };
      chapterAggregate.sessions += 1;
      chapterAggregate.totalSeconds += session.listenedSeconds;
      chapterAggregate.lastListenedAt =
        !chapterAggregate.lastListenedAt || session.timestamp > chapterAggregate.lastListenedAt
          ? session.timestamp
          : chapterAggregate.lastListenedAt;
      byChapter.set(chapterKey, chapterAggregate);
    }

    const normalizedRecentSessions = groupedSessions
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      .slice(0, 25);

    res.json({
      generatedAt: new Date().toISOString(),
      totals: {
        sessions: groupedSessions.length,
        totalSeconds: Math.round(totalSeconds * 1000) / 1000,
        averageSeconds:
          groupedSessions.length > 0 ? Math.round((totalSeconds / groupedSessions.length) * 1000) / 1000 : 0,
        daysActive: activeDays.size,
        lastListenedAt
      },
      byDay: [...byDay.values()].sort((left, right) => left.date.localeCompare(right.date)).slice(-14),
      bySource: [...bySource.values()].sort((left, right) => right.totalSeconds - left.totalSeconds),
      topBooks: [...byBook.values()].sort((left, right) => right.totalSeconds - left.totalSeconds).slice(0, 8),
      topChapters: [...byChapter.values()].sort((left, right) => right.totalSeconds - left.totalSeconds).slice(0, 8),
      recentSessions: normalizedRecentSessions
    });
  } catch (error) {
    next(error);
  }
});

export default router;
