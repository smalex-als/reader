import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from '../config.js';
import { safeStat } from './fs.js';
import { createHttpError } from './errors.js';
import {
  finalizeChapterAudio,
  prepareChapterAudio,
  streamChapterAudioChunk
} from './streamAudio.js';

const JOB_STORE_PATH = path.join(DATA_DIR, 'chapter-audio-jobs.json');
const activeSignals = new Map();
let cachedJobs = null;
let writeQueue = Promise.resolve();

function getJobKey(bookId, chapterNumber) {
  return `${bookId}:${chapterNumber}`;
}

function serializeJobs(jobs) {
  return JSON.stringify({ jobs }, null, 2);
}

async function loadJobs() {
  if (cachedJobs) {
    return cachedJobs;
  }
  try {
    const raw = await fs.readFile(JOB_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    cachedJobs = Array.isArray(parsed?.jobs) ? parsed.jobs : Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error?.code === 'ENOENT') {
      cachedJobs = [];
    } else {
      throw error;
    }
  }
  return cachedJobs;
}

async function saveJobs(nextJobs) {
  cachedJobs = nextJobs;
  await fs.mkdir(DATA_DIR, { recursive: true });
  writeQueue = writeQueue.then(() => fs.writeFile(JOB_STORE_PATH, serializeJobs(nextJobs), 'utf8'));
  await writeQueue;
}

function normalizeJob(job) {
  return {
    bookId: job.bookId,
    chapterNumber: job.chapterNumber,
    status: job.status ?? 'queued',
    startedAt: job.startedAt ?? null,
    updatedAt: job.updatedAt ?? null,
    error: job.error ?? null,
    audioUrl: job.audioUrl ?? null
  };
}

export async function getChapterAudioJob(bookId, chapterNumber) {
  const jobs = await loadJobs();
  const job = jobs.find(
    (entry) => entry.bookId === bookId && entry.chapterNumber === chapterNumber
  );
  return job ? normalizeJob(job) : null;
}

async function upsertJob(nextJob) {
  const jobs = await loadJobs();
  const next = normalizeJob(nextJob);
  const index = jobs.findIndex(
    (entry) => entry.bookId === next.bookId && entry.chapterNumber === next.chapterNumber
  );
  if (index === -1) {
    await saveJobs([...jobs, next]);
  } else {
    const updated = [...jobs];
    updated[index] = { ...updated[index], ...next };
    await saveJobs(updated);
  }
  return next;
}

async function updateJob(bookId, chapterNumber, updates) {
  const existing = await getChapterAudioJob(bookId, chapterNumber);
  const next = {
    ...(existing ?? { bookId, chapterNumber }),
    ...updates,
    updatedAt: updates.updatedAt ?? new Date().toISOString()
  };
  return upsertJob(next);
}

export async function cancelChapterAudioJob(bookId, chapterNumber) {
  const key = getJobKey(bookId, chapterNumber);
  const signal = activeSignals.get(key);
  if (signal) {
    signal.canceled = true;
  }
  return updateJob(bookId, chapterNumber, {
    status: 'canceled',
    error: null,
    audioUrl: null
  });
}

async function finalizeFailure(bookId, chapterNumber, error) {
  const message = error instanceof Error ? error.message : 'Audio generation failed';
  await updateJob(bookId, chapterNumber, {
    status: 'failed',
    error: message
  });
}

async function runChapterAudioJob({ bookId, chapterNumber, voice }) {
  const key = getJobKey(bookId, chapterNumber);
  try {
    await updateJob(bookId, chapterNumber, {
      status: 'running',
      startedAt: new Date().toISOString(),
      error: null
    });

    const signal = activeSignals.get(key);
    if (signal?.canceled) {
      await updateJob(bookId, chapterNumber, { status: 'canceled' });
      return;
    }

    const preparation = await prepareChapterAudio({ bookId, chapterNumber });
    if ('existingAudioUrl' in preparation) {
      await updateJob(bookId, chapterNumber, {
        status: 'completed',
        audioUrl: preparation.existingAudioUrl,
        error: null
      });
      return;
    }

    const pcmParts = [];
    for (const chunk of preparation.textChunks) {
      if (signal?.canceled) {
        await updateJob(bookId, chapterNumber, { status: 'canceled' });
        return;
      }
      const pcmBuffer = await streamChapterAudioChunk(chunk, voice);
      if (!pcmBuffer.length) {
        throw createHttpError(502, 'No audio returned from streaming service');
      }
      pcmParts.push(pcmBuffer);
      await updateJob(bookId, chapterNumber, { status: 'running' });
    }

    await finalizeChapterAudio({
      audioPath: preparation.audioPath,
      mp3Path: preparation.mp3Path,
      pcmParts
    });

    const mp3Stat = await safeStat(preparation.mp3Path);
    if (!mp3Stat?.isFile()) {
      throw createHttpError(502, 'Failed to save chapter audio');
    }
    await updateJob(bookId, chapterNumber, {
      status: 'completed',
      audioUrl: preparation.mp3Url,
      error: null
    });
  } catch (error) {
    await finalizeFailure(bookId, chapterNumber, error);
  } finally {
    activeSignals.delete(key);
  }
}

export async function enqueueChapterAudioJob({ bookId, chapterNumber, voice }) {
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    throw createHttpError(400, 'Valid chapter number is required');
  }
  const existing = await getChapterAudioJob(bookId, chapterNumber);
  if (existing?.status === 'queued' || existing?.status === 'running') {
    return existing;
  }
  const job = await upsertJob({
    bookId,
    chapterNumber,
    status: 'queued',
    startedAt: null,
    updatedAt: new Date().toISOString(),
    error: null,
    audioUrl: existing?.audioUrl ?? null
  });
  const key = getJobKey(bookId, chapterNumber);
  activeSignals.set(key, { canceled: false, voice });
  setImmediate(() => {
    void runChapterAudioJob({ bookId, chapterNumber, voice });
  });
  return job;
}
