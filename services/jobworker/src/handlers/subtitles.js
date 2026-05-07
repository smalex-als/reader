import path from 'node:path';
import { READER_SUBTITLE_SUBMIT_URL } from '../config.js';
import {
  errorMessage,
  normalizeRelativePath,
  nowIso,
  resolveDataPath,
  serializeError,
  statFile
} from '../lib.js';

const SYNC_SUBTITLES_URL = process.env.JOBWORKER_SYNC_SUBTITLES_URL || 'http://sync-subtitles:3100/generate';
const SUBTITLE_TIMEOUT_MS = Number.parseInt(process.env.JOBWORKER_SUBTITLE_TIMEOUT_MS || '1800000', 10);
const SUBTITLE_POLL_INTERVAL_MS = Number.parseInt(process.env.JOBWORKER_SUBTITLE_POLL_INTERVAL_MS || '2000', 10);

function normalizeSubtitlePayload(input) {
  const payload = input && typeof input === 'object' ? input : {};
  const audio = normalizeRelativePath(payload.audio, 'audio');
  const text = normalizeRelativePath(payload.text, 'text');
  const destSrt = normalizeRelativePath(payload.destSrt, 'destSrt');
  return {
    audio,
    text,
    textLanguage:
      typeof payload.textLanguage === 'string' && payload.textLanguage.trim()
        ? payload.textLanguage.trim()
        : 'english_us_arpa',
    destSrt,
    skipValidate: true,
    sentenceMode: 'strict',
    maxLineChars: 95,
    beam: 100,
    retryBeam: 400
  };
}

function resolveSyncSubtitlesBaseUrl() {
  const url = new URL(SYNC_SUBTITLES_URL);
  if (url.pathname.endsWith('/generate')) {
    url.pathname = url.pathname.slice(0, -'/generate'.length) || '/';
  }
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(payload.error || payload.message || `sync-subtitles failed with HTTP ${response.status}`);
  }
  return payload;
}

async function submitToReader({ payload, status = null, srtText = null }) {
  const response = await fetch(READER_SUBTITLE_SUBMIT_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      payload,
      status: status
        ? {
            ...status,
            workerUpdatedAt: nowIso()
          }
        : null,
      srtText
    })
  });
  const result = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(result.error || `reader subtitle submit failed with HTTP ${response.status}`);
  }
  return result;
}

async function requestSubtitlesAsync(payload, context = {}) {
  const baseUrl = resolveSyncSubtitlesBaseUrl();
  const controller = new AbortController();
  const timeoutMs = Number.isFinite(SUBTITLE_TIMEOUT_MS) && SUBTITLE_TIMEOUT_MS > 0 ? SUBTITLE_TIMEOUT_MS : 0;
  const deadline = timeoutMs > 0 ? Date.now() + timeoutMs : 0;
  const timeout = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const queued = await fetchJson(`${baseUrl}/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        audio: payload.audio,
        text: payload.text,
        out: path.basename(payload.destSrt),
        language: payload.textLanguage,
        skipValidate: payload.skipValidate,
        sentenceMode: payload.sentenceMode,
        maxLineChars: payload.maxLineChars,
        beam: payload.beam,
        retryBeam: payload.retryBeam
      }),
      signal: controller.signal
    });
    const syncJobId = queued?.job?.id;
    if (!syncJobId) {
      throw new Error('sync-subtitles did not return a job id');
    }
    await context.log?.('Subtitle sync job queued', { syncJobId });

    let lastStatus = queued.job.status;
    while (true) {
      if (deadline > 0 && Date.now() > deadline) {
        throw new Error(`Subtitle sync job timed out after ${timeoutMs}ms`);
      }
      const statusPayload = await fetchJson(`${baseUrl}/jobs/${encodeURIComponent(syncJobId)}`, {
        signal: controller.signal
      });
      const job = statusPayload.job;
      if (!job) {
        throw new Error(`sync-subtitles job disappeared: ${syncJobId}`);
      }
      if (job.status !== lastStatus) {
        lastStatus = job.status;
        await context.log?.('Subtitle sync job status changed', {
          syncJobId,
          status: job.status,
          error: job.error ?? null
        });
      }
      if (job.status === 'completed') {
        const resultResponse = await fetch(`${baseUrl}/jobs/${encodeURIComponent(syncJobId)}/result`, {
          signal: controller.signal
        });
        if (!resultResponse.ok) {
          const payload = await readJsonResponse(resultResponse);
          throw new Error(payload.error || `sync-subtitles result failed with HTTP ${resultResponse.status}`);
        }
        return await resultResponse.text();
      }
      if (job.status === 'failed') {
        throw new Error(job.error || `sync-subtitles job failed: ${syncJobId}`);
      }
      await sleep(SUBTITLE_POLL_INTERVAL_MS > 0 ? SUBTITLE_POLL_INTERVAL_MS : 2000);
    }
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export const subtitlesHandler = {
  type: 'chapter_subtitles',
  aliases: ['subtitles'],

  async normalize(payload) {
    return normalizeSubtitlePayload(payload);
  },

  findDuplicate(jobs, payload) {
    return jobs.find(
      (job) =>
        job.type === this.type &&
        job.payload?.destSrt === payload.destSrt &&
        (job.status === 'queued' || job.status === 'running')
    );
  },

  async createCompletedJob(payload) {
    const existingSrt = await statFile(resolveDataPath(payload.destSrt));
    if (!existingSrt?.isFile()) {
      return null;
    }
    return {
      result: {
        srtPath: resolveDataPath(payload.destSrt),
        responseBytes: existingSrt.size
      }
    };
  },

  async onQueued(job) {
    await submitToReader({
      payload: job.payload,
      status: {
        status: 'queued',
        jobId: job.id,
        queuedAt: job.createdAt
      }
    });
  },

  async onStarted(job) {
    await submitToReader({
      payload: job.payload,
      status: {
        status: 'running',
        jobId: job.id,
        queuedAt: job.createdAt,
        startedAt: job.startedAt
      }
    });
  },

  async run(job, context = {}) {
    await context.log?.('Requesting subtitle sync service', {
      serviceUrl: SYNC_SUBTITLES_URL,
      audio: job.payload.audio,
      text: job.payload.text,
      destSrt: job.payload.destSrt,
      textLanguage: job.payload.textLanguage,
      beam: job.payload.beam,
      retryBeam: job.payload.retryBeam
    });
    const srtText = await requestSubtitlesAsync(job.payload, context);
    if (!srtText.trim()) {
      throw new Error('Subtitle service returned an empty SRT file');
    }
    await context.log?.('Submitting subtitle file to reader', {
      submitUrl: READER_SUBTITLE_SUBMIT_URL,
      destSrt: job.payload.destSrt,
      bytes: Buffer.byteLength(srtText, 'utf8')
    });
    await submitToReader({
      payload: job.payload,
      srtText
    });
    return {
      srtPath: job.payload.destSrt,
      responseBytes: Buffer.byteLength(srtText, 'utf8')
    };
  },

  async onCompleted(job, result) {
    await submitToReader({
      payload: job.payload,
      status: {
        status: 'completed',
        jobId: job.id,
        queuedAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        responseBytes: result?.responseBytes ?? null
      }
    });
  },

  async onFailed(job, error) {
    await submitToReader({
      payload: job.payload,
      status: {
        status: 'failed',
        jobId: job.id,
        queuedAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        error: errorMessage(error),
        errorDetails: serializeError(error)
      }
    });
  }
};
