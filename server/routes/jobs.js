import express from 'express';
import { CHAPTER_JOBWORKER_URL } from '../config.js';
import { createHttpError } from '../lib/errors.js';
import { submitChapterSubtitleJobUpdate } from '../lib/chapterSubtitles.js';

const router = express.Router();

function resolveJobWorkerBaseUrl() {
  const configured = CHAPTER_JOBWORKER_URL.trim();
  if (!configured) {
    return '';
  }
  const url = new URL(configured);
  const jobsIndex = url.pathname.indexOf('/jobs');
  url.pathname = jobsIndex >= 0 ? url.pathname.slice(0, jobsIndex) || '/' : url.pathname || '/';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

async function fetchJobWorkerJson(pathname) {
  const baseUrl = resolveJobWorkerBaseUrl();
  if (!baseUrl) {
    throw createHttpError(503, 'Job worker is not configured');
  }
  const response = await fetch(`${baseUrl}${pathname}`);
  const text = await response.text();
  const payload = text.trim() ? JSON.parse(text) : {};
  if (!response.ok) {
    throw createHttpError(response.status, payload.error || `Job worker request failed with HTTP ${response.status}`);
  }
  return payload;
}

router.get('/api/jobs', async (_req, res, next) => {
  try {
    res.json(await fetchJobWorkerJson('/jobs'));
  } catch (error) {
    next(error);
  }
});

router.get('/api/jobs/:id', async (req, res, next) => {
  try {
    res.json(await fetchJobWorkerJson(`/jobs/${encodeURIComponent(req.params.id)}`));
  } catch (error) {
    next(error);
  }
});

router.post('/api/jobs/subtitles/submit', async (req, res, next) => {
  try {
    const result = await submitChapterSubtitleJobUpdate({
      payload: req.body?.payload,
      status: req.body?.status ?? null,
      srtText: typeof req.body?.srtText === 'string' ? req.body.srtText : null
    });
    res.json({ status: 'ok', result });
  } catch (error) {
    next(error);
  }
});

export default router;
