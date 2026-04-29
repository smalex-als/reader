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
import { generateChapterXaiAudio } from './chapterXaiAudio.js';
import { generateChapterYandexAudio } from './chapterYandexAudio.js';

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
    provider: job.provider === 'xai' || job.provider === 'yandex' ? job.provider : 'default',
    status: job.status ?? 'queued',
    versionId: typeof job.versionId === 'string' ? job.versionId : 'base',
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

export async function clearCompletedChapterAudioJob(bookId, chapterNumber, versionId = 'base') {
  const jobs = await loadJobs();
  const normalizedVersionId = typeof versionId === 'string' && versionId.trim() ? versionId.trim() : 'base';
  const existing = jobs.find(
    (entry) => entry.bookId === bookId && entry.chapterNumber === chapterNumber
  );
  if (!existing) {
    return null;
  }
  const existingStatus = existing.status ?? 'queued';
  if (existingStatus === 'queued' || existingStatus === 'running') {
    return normalizeJob(existing);
  }
  if ((existing.versionId ?? 'base') !== normalizedVersionId) {
    return normalizeJob(existing);
  }
  await saveJobs(
    jobs.filter((entry) => entry.bookId !== bookId || entry.chapterNumber !== chapterNumber)
  );
  return null;
}

async function finalizeFailure(bookId, chapterNumber, error) {
  const message = error instanceof Error ? error.message : 'Audio generation failed';
  await updateJob(bookId, chapterNumber, {
    status: 'failed',
    error: message
  });
}

async function runChapterAudioJob({ bookId, chapterNumber, voice, versionId = null, provider = 'default' }) {
  const key = getJobKey(bookId, chapterNumber);
  let preparation = null;
  try {
    await updateJob(bookId, chapterNumber, {
      provider,
      status: 'running',
      versionId: versionId ?? 'base',
      startedAt: new Date().toISOString(),
      error: null
    });

    const signal = activeSignals.get(key);
    if (signal?.canceled) {
      await updateJob(bookId, chapterNumber, { status: 'canceled' });
      return;
    }

    if (provider === 'xai') {
      const result = await generateChapterXaiAudio({ bookId, chapterNumber, versionId, voice });
      await updateJob(bookId, chapterNumber, {
        provider,
        status: 'completed',
        versionId: result.versionId ?? versionId ?? 'base',
        audioUrl: 'existingAudioUrl' in result ? result.existingAudioUrl : result.mp3Url,
        error: null
      });
      return;
    }

    if (provider === 'yandex') {
      const result = await generateChapterYandexAudio({ bookId, chapterNumber, versionId, voice });
      await updateJob(bookId, chapterNumber, {
        provider,
        status: 'completed',
        versionId: result.versionId ?? versionId ?? 'base',
        audioUrl: 'existingAudioUrl' in result ? result.existingAudioUrl : result.mp3Url,
        error: null
      });
      return;
    }

    preparation = await prepareChapterAudio({ bookId, chapterNumber, versionId, provider });
    if ('existingAudioUrl' in preparation) {
      await updateJob(bookId, chapterNumber, {
        provider,
        status: 'completed',
        versionId: preparation.versionId ?? versionId ?? 'base',
        audioUrl: preparation.existingAudioUrl,
        error: null
      });
      return;
    }

    const pcmHandle = await fs.open(preparation.pcmPath, 'w');
    let pcmLength = 0;
    let canceled = false;
    try {
      for (const chunk of preparation.textChunks) {
        if (signal?.canceled) {
          canceled = true;
          break;
        }
        const pcmBuffer = await streamChapterAudioChunk(chunk, voice);
        if (!pcmBuffer.length) {
          throw createHttpError(502, 'No audio returned from streaming service');
        }
        await pcmHandle.write(pcmBuffer);
        pcmLength += pcmBuffer.length;
        await updateJob(bookId, chapterNumber, { status: 'running' });
      }
    } finally {
      await pcmHandle.close();
    }

    if (canceled) {
      try {
        await fs.unlink(preparation.pcmPath);
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          console.warn('Failed to delete canceled PCM file', error);
        }
      }
      await updateJob(bookId, chapterNumber, { status: 'canceled' });
      return;
    }

    await finalizeChapterAudio({
      audioPath: preparation.audioPath,
      mp3Path: preparation.mp3Path,
      pcmPath: preparation.pcmPath,
      pcmLength,
      metaPath: preparation.metaPath,
      versionId: preparation.versionId,
      provider
    });

    const mp3Stat = await safeStat(preparation.mp3Path);
    if (!mp3Stat?.isFile()) {
      throw createHttpError(502, 'Failed to save chapter audio');
    }
    await updateJob(bookId, chapterNumber, {
      provider,
      status: 'completed',
      versionId: preparation.versionId ?? versionId ?? 'base',
      audioUrl: preparation.mp3Url,
      error: null
    });
  } catch (error) {
    if (preparation?.pcmPath) {
      try {
        await fs.unlink(preparation.pcmPath);
      } catch (cleanupError) {
        if (cleanupError?.code !== 'ENOENT') {
          console.warn('Failed to delete PCM file after error', cleanupError);
        }
      }
    }
    await finalizeFailure(bookId, chapterNumber, error);
  } finally {
    activeSignals.delete(key);
  }
}

export async function enqueueChapterAudioJob({
  bookId,
  chapterNumber,
  voice,
  versionId = null,
  provider = 'default'
}) {
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    throw createHttpError(400, 'Valid chapter number is required');
  }
  const existing = await getChapterAudioJob(bookId, chapterNumber);
  if (
    (existing?.status === 'queued' || existing?.status === 'running') &&
    (existing.versionId ?? 'base') === (versionId ?? 'base') &&
    (existing.provider ?? 'default') === provider
  ) {
    return existing;
  }
  const job = await upsertJob({
    bookId,
    chapterNumber,
    provider,
    status: 'queued',
    versionId: versionId ?? 'base',
    startedAt: null,
    updatedAt: new Date().toISOString(),
    error: null,
    audioUrl:
      existing &&
      (existing.versionId ?? 'base') === (versionId ?? 'base') &&
      (existing.provider ?? 'default') === provider
        ? existing.audioUrl ?? null
        : null
  });
  const key = getJobKey(bookId, chapterNumber);
  activeSignals.set(key, { canceled: false, voice, versionId: versionId ?? 'base', provider });
  setImmediate(() => {
    void runChapterAudioJob({ bookId, chapterNumber, voice, versionId, provider });
  });
  return job;
}
