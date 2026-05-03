import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from '../config.js';
import { safeStat } from './fs.js';
import { createHttpError } from './errors.js';
import {
  finalizeChapterAudio,
  PCM_STREAM_BIT_DEPTH,
  PCM_STREAM_CHANNEL_COUNT,
  PCM_STREAM_SAMPLE_RATE,
  prepareChapterAudio,
  streamChapterAudioChunk
} from './streamAudio.js';
import { generateChapterXaiAudio } from './chapterXaiAudio.js';
import { generateChapterYandexAudio } from './chapterYandexAudio.js';
import { createTtsLogTimer } from './ttsLog.js';

const JOB_STORE_PATH = path.join(DATA_DIR, 'chapter-audio-jobs.json');
const activeSignals = new Map();
let cachedJobs = null;
let writeQueue = Promise.resolve();
const PCM_BYTES_PER_SECOND = PCM_STREAM_SAMPLE_RATE * PCM_STREAM_CHANNEL_COUNT * (PCM_STREAM_BIT_DEPTH / 8);

function roundSeconds(value) {
  return Math.round(value * 1000) / 1000;
}

function closeSubchapter(entry, endSeconds) {
  if (!entry) {
    return null;
  }
  const roundedEnd = roundSeconds(endSeconds);
  return {
    title: entry.title,
    startSeconds: entry.startSeconds,
    endSeconds: roundedEnd,
    durationSeconds: roundSeconds(Math.max(0, roundedEnd - entry.startSeconds))
  };
}

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

async function runChapterAudioJob({
  bookId,
  chapterNumber,
  voice,
  versionId = null,
  provider = 'default',
  force = false
}) {
  const key = getJobKey(bookId, chapterNumber);
  let preparation = null;
  const normalizedProvider = provider === 'xai' || provider === 'yandex' ? provider : 'streaming';
  const jobLog = createTtsLogTimer({
    scope: 'job',
    endpoint: 'chapter-audio',
    provider: normalizedProvider,
    voice: voice || null,
    format: 'mp3',
    bookId,
    chapterNumber,
    versionId: versionId ?? 'base'
  });
  let jobLogged = false;
  const finishJobLog = async (result) => {
    if (jobLogged) {
      return;
    }
    jobLogged = true;
    await jobLog.finish(result);
  };
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
      const result = await generateChapterXaiAudio({ bookId, chapterNumber, versionId, voice, force });
      await updateJob(bookId, chapterNumber, {
        provider,
        status: 'completed',
        versionId: result.versionId ?? versionId ?? 'base',
        audioUrl: 'existingAudioUrl' in result ? result.existingAudioUrl : result.mp3Url,
        error: null
      });
      await finishJobLog({
        status: 'ok',
        source: 'existingAudioUrl' in result ? 'file' : 'ai',
        cacheHit: 'existingAudioUrl' in result,
        audioUrl: 'existingAudioUrl' in result ? result.existingAudioUrl : result.mp3Url,
        text: 'cleanText' in result ? result.cleanText : '',
        versionId: result.versionId ?? versionId ?? 'base'
      });
      return;
    }

    if (provider === 'yandex') {
      const result = await generateChapterYandexAudio({ bookId, chapterNumber, versionId, voice, force });
      await updateJob(bookId, chapterNumber, {
        provider,
        status: 'completed',
        versionId: result.versionId ?? versionId ?? 'base',
        audioUrl: 'existingAudioUrl' in result ? result.existingAudioUrl : result.mp3Url,
        error: null
      });
      await finishJobLog({
        status: 'ok',
        source: 'existingAudioUrl' in result ? 'file' : 'ai',
        cacheHit: 'existingAudioUrl' in result,
        audioUrl: 'existingAudioUrl' in result ? result.existingAudioUrl : result.mp3Url,
        text: 'cleanText' in result ? result.cleanText : '',
        versionId: result.versionId ?? versionId ?? 'base'
      });
      return;
    }

    preparation = await prepareChapterAudio({ bookId, chapterNumber, versionId, provider, voice, force });
    if ('existingAudioUrl' in preparation) {
      await updateJob(bookId, chapterNumber, {
        provider,
        status: 'completed',
        versionId: preparation.versionId ?? versionId ?? 'base',
        audioUrl: preparation.existingAudioUrl,
        error: null
      });
      await finishJobLog({
        status: 'ok',
        source: 'file',
        cacheHit: true,
        audioUrl: preparation.existingAudioUrl,
        text: preparation.cleanText ?? '',
        versionId: preparation.versionId ?? versionId ?? 'base'
      });
      return;
    }

    const pcmHandle = await fs.open(preparation.pcmPath, 'w');
    let pcmLength = 0;
    let canceled = false;
    let activeSubchapter = null;
    const subchapters = [];
    try {
      for (let index = 0; index < preparation.textChunks.length; index += 1) {
        const chunk = preparation.textChunks[index];
        const chunkText = typeof chunk === 'string' ? chunk : chunk.text;
        if (signal?.canceled) {
          canceled = true;
          break;
        }
        if (chunk.title && activeSubchapter?.sectionIndex !== chunk.sectionIndex) {
          const closed = closeSubchapter(activeSubchapter, pcmLength / PCM_BYTES_PER_SECOND);
          if (closed) {
            subchapters.push(closed);
          }
          activeSubchapter = {
            sectionIndex: chunk.sectionIndex,
            title: chunk.title,
            startSeconds: roundSeconds(pcmLength / PCM_BYTES_PER_SECOND)
          };
        }
        const chunkLog = createTtsLogTimer({
          scope: 'job',
          endpoint: 'chapter-audio-chunk',
          provider: 'streaming',
          voice: voice || null,
          format: 'pcm_s16le',
          bookId,
          chapterNumber,
          versionId: preparation.versionId,
          chunkIndex: index + 1,
          chunkCount: preparation.textChunks.length,
          text: chunkText
        });
        let pcmBuffer;
        try {
          pcmBuffer = await streamChapterAudioChunk(chunkText, voice);
          await chunkLog.finish({
            status: 'ok',
            source: 'streaming',
            responseBytes: pcmBuffer.length,
            text: chunkText
          });
        } catch (error) {
          await chunkLog.finish({ status: 'error', error, text: chunkText });
          throw error;
        }
        if (!pcmBuffer.length) {
          throw createHttpError(502, 'No audio returned from streaming service');
        }
        await pcmHandle.write(pcmBuffer);
        pcmLength += pcmBuffer.length;
        await updateJob(bookId, chapterNumber, { status: 'running' });
      }
      const closed = closeSubchapter(activeSubchapter, pcmLength / PCM_BYTES_PER_SECOND);
      if (closed) {
        subchapters.push(closed);
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
      await finishJobLog({
        status: 'aborted',
        source: 'streaming',
        text: preparation.cleanText,
        versionId: preparation.versionId
      });
      return;
    }

    await finalizeChapterAudio({
      audioPath: preparation.audioPath,
      mp3Path: preparation.mp3Path,
      pcmPath: preparation.pcmPath,
      pcmLength,
      metaPath: preparation.metaPath,
      versionId: preparation.versionId,
      provider,
      voice,
      textHash: preparation.textHash,
      subchapters
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
    await finishJobLog({
      status: 'ok',
      source: 'streaming',
      cacheHit: false,
      responseBytes: mp3Stat.size,
      audioUrl: preparation.mp3Url,
      text: preparation.cleanText,
      versionId: preparation.versionId ?? versionId ?? 'base'
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
    await finishJobLog({
      status: 'error',
      error,
      text: preparation?.cleanText ?? '',
      versionId: preparation?.versionId ?? versionId ?? 'base'
    });
  } finally {
    activeSignals.delete(key);
  }
}

export async function enqueueChapterAudioJob({
  bookId,
  chapterNumber,
  voice,
  versionId = null,
  provider = 'default',
  force = false
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
      !force &&
      (existing.versionId ?? 'base') === (versionId ?? 'base') &&
      (existing.provider ?? 'default') === provider
        ? existing.audioUrl ?? null
        : null
  });
  const key = getJobKey(bookId, chapterNumber);
  activeSignals.set(key, { canceled: false, voice, versionId: versionId ?? 'base', provider, force });
  setImmediate(() => {
    void runChapterAudioJob({ bookId, chapterNumber, voice, versionId, provider, force });
  });
  return job;
}
